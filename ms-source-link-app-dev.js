/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
// ms-source-link-app.js

console.info("ms-source-link-app.js loaded...");

const cloudFunctionUrlWriteFirestore = "https://asia-east2-ms-source-tracking-tool-dev.cloudfunctions.net/sourceTrackingToolDevWriteFirestore";
const cloudFunctionUrlUpdateFirestore = "https://asia-east2-ms-source-tracking-tool-dev.cloudfunctions.net/sourceTrackingToolDevUpdateFirestore";

(function () {
	const CF_WRITE_FIRESTORE = cloudFunctionUrlWriteFirestore;
	const CF_UPDATE_FIRESTORE = cloudFunctionUrlUpdateFirestore;

	const COOKIE_NAME = "__ms_source_info";
	const PAGE_DOMAIN = location.hostname.replace("www.", "");
	const QUERY_PARAMS = [
		"utm_campaign",
		"utm_source",
		"utm_medium",
		"utm_term",
		"utm_content",
		"utm_id",
		"utm_source_platform",
		"utm_creative_format",
		"utm_marketing_tactic",
		"fbclid",
		"gclid",
		"wbraid",
		"dclid",
		"msclkid",
		"li_fat_id",
		"ttclid",
		"twclid",
	];

	// Function to get cookie by name
	const getCookie = (name) => {
		const cookies = document.cookie.split(";");
		for (let i = 0; i < cookies.length; i++) {
			const cookie = cookies[i].trim();
			if (cookie.indexOf(name + "=") === 0) {
				return cookie.substring(name.length + 1);
			}
		}
		return null;
	};

	// Function to send HTTP request
	const sendHttpRequest = (url, data, callback) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", url, true);
		xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");

		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					const response = JSON.parse(xhr.responseText);
					callback(response);
				}
			}
		};

		xhr.send(JSON.stringify(data));
	};

	// Function to set cookie
	const setCookie = (name, value, expires) => {
		// Get the domain from the current location
		let domain = location.hostname;

		// Check if it's a subdomain and not just a top-level domain (TLD)
		if (domain.split(".").length > 2) {
			// If so, add a dot at the beginning to make the cookie available across all subdomains
			domain = "." + domain;
		}

		const cookieString = `${name}=${encodeURIComponent(
			value
		)}; expires=${expires}; path=/; domain=${domain};`;

		document.cookie = cookieString;
	};

	// Function to extract query parameters
	const extractQueryParams = () => {
		const urlParams = new URLSearchParams(location.search);
		const queryParams = {};
		QUERY_PARAMS.forEach((paramName) => {
			if (urlParams.has(paramName)) {
				queryParams[paramName] = urlParams.get(paramName);
			}
		});
		return queryParams;
	};

	// Function to check if referrer is internal
	const isInternalReferrer = (referrer) => {
		const currentDomain = document.location.hostname.replace("www.", "");
		return referrer.includes(currentDomain);
	};

	// Function to get the last referrer
	const getLastReferrer = (referrerString) => {
		const referrers = referrerString.split("|");
		return referrers[referrers.length - 1];
	};

	// Function to write to Firestore
	const writeFirestore = (data) => {
		const cloudFunctionUrl = CF_WRITE_FIRESTORE;

		sendHttpRequest(cloudFunctionUrl, data, (response) => {
			if (response && response.documentId && response.createdTime) {
				appendUIDToCookie(response.documentId, response.createdTime);
				console.log("Document ID and Created Time appended to the cookie.");
			} else {
				console.log(
					"No valid response data. Document ID and Created Time not appended."
				);
			}
		});
	};

	// Function to append new referrer to cookie
	const appendNewReferrerToCookie = (newReferrer, existingCookieValue) => {
		existingCookieValue.referrer = newReferrer;

		setCookie(
			COOKIE_NAME,
			JSON.stringify(existingCookieValue),
			new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000)
		);

		const lastReferrer = getLastReferrer(existingCookieValue.referrer);
		const queryParams = extractQueryParams();
		const uid = existingCookieValue.uid;

		const newData = {
			created_at: Date.now(),
			domain: PAGE_DOMAIN,
			referrer: lastReferrer,
			landing_page: location.pathname,
			query_params: queryParams,
		};

		updateFirestoreWithNewSource(uid, newData);
	};

	// Function to update Firestore with new source
	const updateFirestoreWithNewSource = (uid, newData) => {
		const updateFirestoreUrl = CF_UPDATE_FIRESTORE;
		newData.uid = uid;

		sendHttpRequest(updateFirestoreUrl, newData, () => {
			console.log("Firestore updated successfully with new data.");
		});
	};

	// Function to append UID to cookie
	const appendUIDToCookie = (documentId, createdTime) => {
		try {
			let existingCookie = getCookie(COOKIE_NAME);
			existingCookie = decodeURIComponent(existingCookie);

			const existingCookieValue = existingCookie
				? JSON.parse(existingCookie)
				: {};
			existingCookieValue.uid = documentId;
			existingCookieValue.created_at = createdTime;

			setCookie(
				COOKIE_NAME,
				JSON.stringify(existingCookieValue),
				new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000)
			);
		} catch (error) {
			console.error("Error appending to cookie:", error);
		}
	};

	// Function to handle cookie logic
	const handleCookie = (referrer) => {
		const expires = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000); // 2 years
		const newCookieValue = { referrer: referrer };
		setCookie(COOKIE_NAME, JSON.stringify(newCookieValue), expires);
		console.log("Cookie set or updated with referrer: " + referrer);

		const queryParams = extractQueryParams();
		const data = {
			domain: location.hostname.replace("www.", ""),
			source_data: [
				{
					created_at: Date.now(),
					domain: location.hostname.replace("www.", ""),
					referrer: referrer,
					landing_page: location.pathname,
					query_params: queryParams,
				},
			],
		};

		writeFirestore(data);
	};

	// Function to handle subsequent visit
	const handleSubsequentVisit = (referrer) => {
		const msSourceInfoCookie = getCookie(COOKIE_NAME);
		const storedReferrer = JSON.parse(
			decodeURIComponent(msSourceInfoCookie)
		).referrer;

		if (
			referrer &&
			(referrer !== PAGE_DOMAIN || referrer !== "direct") &&
			!isInternalReferrer(referrer)
		) {
			appendNewReferrerToCookie(storedReferrer + "|" + referrer, {
				referrer: storedReferrer,
				uid: JSON.parse(decodeURIComponent(msSourceInfoCookie)).uid,
			});
		} else {
			console.log("No need to update the cookie. Same or internal referrer.");
		}
	};

	// Function to handle first visit
	const handleFirstVisit = (referrer) => {
		const defaultReferrer =
			referrer && referrer !== PAGE_DOMAIN ? referrer : "direct";
		handleCookie(defaultReferrer);
	};

	// Function to handle email input and update Firestore
	const handleEmailInputs = () => {
		// Get all email input fields
		const emailInputs = document.querySelectorAll(
			'input[type="email"], input[name^="email"], input[name*="mail"]'
		);

		// Attach an event listener to each email input field
		emailInputs.forEach((emailInput) => {
			emailInput.addEventListener("blur", () => {
				const email = emailInput.value.trim();
				console.log(email);

				// Check if email is not empty
				if (email) {
					// Retrieve UID from the '__ms_source_info' cookie
					const msSourceInfoCookie = getCookie(COOKIE_NAME);

					if (msSourceInfoCookie) {
						try {
							const sourceInfoData = JSON.parse(
								decodeURIComponent(msSourceInfoCookie)
							);
							const uid = sourceInfoData.uid;

							// Check if UID is valid
							if (uid) {
								const data = { uid, email };
								sendUpdateRequestToFirestore(data);
							} else {
								console.warn("Invalid ID from '__ms_source_info' cookie.");
							}
						} catch (error) {
							console.error(
								"Error parsing '__ms_source_info' cookie data:",
								error
							);
						}
					} else {
						console.warn(" '__ms_source_info' cookie not found.");
					}
				} else {
					console.warn("Email input is empty.");
				}
			});
		});
	};

	// Function to send update request to Firestore
	const sendUpdateRequestToFirestore = (data) => {
		const updateFirestoreUrl = CF_UPDATE_FIRESTORE;

		sendHttpRequest(updateFirestoreUrl, data, () => {
			console.log("Firestore updated successfully with new data.");
		});
	};

	// Function to write to Firestore and handle source information
	const writeToCookie = () => {
		const msSourceInfoCookie = getCookie(COOKIE_NAME);
		const referrer = document.referrer
			? new URL(document.referrer).hostname.replace("www.", "")
			: "";
		if (!msSourceInfoCookie) {
			handleFirstVisit(referrer);
		} else {
			handleSubsequentVisit(referrer);
		}
	};

	// Call the function on page load
	writeToCookie();
	handleEmailInputs();
})();

/******/ })()
;