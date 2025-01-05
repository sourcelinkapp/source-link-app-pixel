/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
// ms-source-link-app.js

console.info('ms-source-link-app.js loaded...');

const cloudFunctionUrlWriteFirestore = "https://asia-east2-ms-source-tracking-tool-dev.cloudfunctions.net/sourceTrackingToolDevWriteFirestore";
const cloudFunctionUrlUpdateFirestore = "https://asia-east2-ms-source-tracking-tool-dev.cloudfunctions.net/sourceTrackingToolDevUpdateFirestore";

(function () {
  const CF_WRITE_FIRESTORE = cloudFunctionUrlWriteFirestore;
  const CF_UPDATE_FIRESTORE = cloudFunctionUrlUpdateFirestore;
  const COOKIE_NAME = '_source_link_data';
  const PAGE_DOMAIN = location.hostname.replace('www.', '').toLocaleLowerCase();

  // Get client ID from script tag
  const scriptTag = document.currentScript;
  const clientId = scriptTag.getAttribute('data-client-id');

  if (!clientId) {
    console.error('Client ID is required');
    return;
  }

  const CLIENT_ID = clientId.toUpperCase();
  const SESSION_KEY = `_source_link_${CLIENT_ID}`;

  // Function to validate client status
  const validateClient = async () => {
    // Check session storage first
    const cachedStatus = sessionStorage.getItem(SESSION_KEY);
    if (cachedStatus !== null) {
      return cachedStatus === 'true';
    }

    // Create validation request data
    const validationData = {
      clientId: CLIENT_ID,
      action: 'validate',
    };

    try {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', CF_WRITE_FIRESTORE, true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              try {
                const response = JSON.parse(xhr.responseText);
                const isActive = response.success && response.isActive;
                sessionStorage.setItem(SESSION_KEY, isActive.toString());
                resolve(isActive);
              } catch (error) {
                console.error('Error parsing validation response:', error);
                resolve(false);
              }
            } else {
              resolve(false);
            }
          }
        };

        xhr.onerror = () => {
          console.error('Error making validation request');
          resolve(false);
        };

        xhr.send(JSON.stringify(validationData));
      });
    } catch (error) {
      console.error('Error validating client:', error);
      return false;
    }
  };

  const QUERY_PARAMS = [
    'utm_campaign',
    'utm_source',
    'utm_medium',
    'utm_term',
    'utm_content',
    'utm_id',
    'utm_source_platform',
    'utm_creative_format',
    'utm_marketing_tactic',
    'fbclid',
    'gclid',
    'wbraid',
    'dclid',
    'msclkid',
    'li_fat_id',
    'ttclid',
    'twclid',
  ];

  // Get cookie by name
  const getCookie = (name) => {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.indexOf(name + '=') === 0) {
        return cookie.substring(name.length + 1);
      }
    }
    return null;
  };

  // Generate visitor ID
  const generateVisitorId = () => {
    return 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  };

  // Function to send HTTP request
  const sendHttpRequest = async (url, data, callback) => {
    // Validate client before making any requests
    const isActive = await validateClient();
    if (!isActive) {
      console.error('Client is not active');
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          callback(response);
        } else if (xhr.status === 403) {
          console.warn(
            `🚫 SourceLink disabled - Client ${CLIENT_ID} is inactive`,
          );
        } else {
          console.warn(`⚠️ Source tracking error - Status: ${xhr.status}`);
        }
      }
    };

    xhr.send(JSON.stringify(data));
  };

  // Function to set cookie
  const setCookie = (name, value, expires) => {
    let domain = location.hostname;
    if (domain.split('.').length > 2) {
      domain = '.' + domain;
    }

    const cookieString = `${name}=${encodeURIComponent(
      value,
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
    const currentDomain = document.location.hostname.replace('www.', '');
    return referrer.includes(currentDomain);
  };

  // Function to get the last referrer
  const getLastReferrer = (referrerString) => {
    const referrers = referrerString.split('|');
    return referrers[referrers.length - 1];
  };

  // Function to write to Firestore
  const writeFirestore = (data) => {
    const visitorId = generateVisitorId();

    const firestoreData = {
      clientId: CLIENT_ID,
      websiteId: PAGE_DOMAIN,
      visitorId: visitorId,
      createdAt: Date.now(),
      sourceData: data.sourceData,
    };

    sendHttpRequest(CF_WRITE_FIRESTORE, firestoreData, (response) => {
      if (response && response.success) {
        const cookieData = {
          clientId: CLIENT_ID,
          websiteId: PAGE_DOMAIN,
          visitorId: visitorId,
          referrer: data.sourceData[0].referrer,
          createdAt: Date.now(),
        };
        setCookie(
          COOKIE_NAME,
          JSON.stringify(cookieData),
          new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
        );
        console.log('SourceLink data saved.');
      }
    });
  };

  // Function to update Firestore with new source
  const updateFirestoreWithNewSource = (visitorId, newData) => {
    const updateData = {
      clientId: CLIENT_ID,
      websiteId: PAGE_DOMAIN,
      visitorId: visitorId,
      updatedAt: Date.now(),
      sourceData: [newData],
    };

    sendHttpRequest(CF_UPDATE_FIRESTORE, updateData, () => {
      console.log('Firestore updated successfully with new data.');
    });
  };

  // Function to handle cookie
  const handleCookie = (referrer) => {
    const queryParams = extractQueryParams();

    const data = {
      sourceData: [
        {
          createdAt: Date.now(),
          referrer: referrer,
          landingPage: location.pathname,
          queryParams: queryParams,
        },
      ],
    };

    writeFirestore(data);
  };

  // Function to handle subsequent visit
  const handleSubsequentVisit = (referrer) => {
    const msSourceInfoCookie = getCookie(COOKIE_NAME);
    const cookieData = JSON.parse(decodeURIComponent(msSourceInfoCookie));
    const storedReferrer = cookieData.referrer;
    const visitorId = cookieData.visitorId;

    if (
      referrer &&
      (referrer !== PAGE_DOMAIN || referrer !== 'direct') &&
      !isInternalReferrer(referrer)
    ) {
      // Update cookie with new referrer
      cookieData.referrer = storedReferrer + '|' + referrer;
      setCookie(
        COOKIE_NAME,
        JSON.stringify(cookieData),
        new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
      );

      // Update Firestore
      const lastReferrer = getLastReferrer(cookieData.referrer);
      const queryParams = extractQueryParams();
      const newData = {
        createdAt: Date.now(),
        referrer: lastReferrer,
        landingPage: location.pathname,
        queryParams: queryParams,
      };

      updateFirestoreWithNewSource(visitorId, newData);
    }
  };

  // Function to handle first visit
  const handleFirstVisit = (referrer) => {
    const defaultReferrer =
      referrer && referrer !== PAGE_DOMAIN ? referrer : 'direct';
    handleCookie(defaultReferrer);
  };

  // Function to handle email input and update Firestore
  const handleEmailInputs = () => {
    const emailInputs = document.querySelectorAll(
      'input[type="email"], input[name^="email"], input[name*="mail"]',
    );

    emailInputs.forEach((emailInput) => {
      emailInput.addEventListener('blur', () => {
        const email = emailInput.value.trim();

        if (email) {
          const msSourceInfoCookie = getCookie(COOKIE_NAME);

          if (msSourceInfoCookie) {
            try {
              const cookieData = JSON.parse(
                decodeURIComponent(msSourceInfoCookie),
              );
              const visitorId = cookieData.visitorId;

              if (visitorId) {
                const data = {
                  clientId: CLIENT_ID,
                  websiteId: PAGE_DOMAIN,
                  visitorId: visitorId,
                  email: email,
                };
                sendUpdateRequestToFirestore(data);
              }
            } catch (error) {
              console.error('Error processing cookie data:', error);
            }
          }
        }
      });
    });
  };

  // Function to send update request to Firestore
  const sendUpdateRequestToFirestore = (data) => {
    sendHttpRequest(CF_UPDATE_FIRESTORE, data, () => {
      console.log('Firestore updated successfully with email data.');
    });
  };

  // Function to write to Firestore and handle source information
  const writeToCookie = () => {
    const msSourceInfoCookie = getCookie(COOKIE_NAME);
    const referrer = document.referrer
      ? new URL(document.referrer).hostname.replace('www.', '')
      : '';

    if (!msSourceInfoCookie) {
      handleFirstVisit(referrer);
    } else {
      handleSubsequentVisit(referrer);
    }
  };

  // Initialize the app
  const init = async () => {
    const isActive = await validateClient();
    if (!isActive) {
      console.warn(`🚫 SourceLink disabled - Client ${CLIENT_ID} is inactive`);
      return;
    }

    writeToCookie();
    handleEmailInputs();
  };

  // Call init instead of direct function calls
  init();
})();

/******/ })()
;