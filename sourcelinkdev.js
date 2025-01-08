/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
// src/sourcelink.js

console.info('SourceLink initialized...');

const cloudFunctionUrl = "https://us-west1-ms-source-tracking-tool-dev.cloudfunctions.net/sourceLinkWriteFirebase";

(function () {
  // Action types matching backend
  const ACTIONS = {
    VALIDATE: 'validate',
    CREATE_VISITOR: 'create_visitor',
    UPDATE_SOURCE: 'update_source',
    UPDATE_EMAIL: 'update_email',
  };

  // Constants
  const CF_URL = cloudFunctionUrl;
  const COOKIE_NAME = '_source_link_data';
  const PAGE_DOMAIN = location.hostname.replace('www.', '').toLocaleLowerCase();

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

  // Get pixel ID from script tag
  const scriptTag = document.currentScript;
  const scriptUrl = scriptTag.src;

  // Parse query string manually
  const getPixelId = (url) => {
    const queryString = url.split('?')[1];
    if (!queryString) return null;

    const params = new URLSearchParams(queryString);
    return params.get('pixelId');
  };

  const pixelId = getPixelId(scriptUrl);

  if (!pixelId) {
    console.error('Pixel ID is required');
    return;
  }

  const PIXEL_ID = pixelId.toUpperCase();
  const SESSION_KEY = `_source_link_${PIXEL_ID}`;

  // Utility Functions
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

  const generateVisitorId = () => {
    return 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  };

  const sendHttpRequest = async (url, data) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (response.status === 403) {
          console.warn(
            `🚫 SourceLink disabled - Pixel ${PIXEL_ID} is inactive`,
          );
        } else {
          console.warn(`⚠️ Source tracking error - Status: ${response.status}`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending request:', error);
      throw error;
    }
  };

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

  const isInternalReferrer = (referrer) => {
    const currentDomain = document.location.hostname.replace('www.', '');
    return referrer.includes(currentDomain);
  };

  const getLastReferrer = (referrerString) => {
    const referrers = referrerString.split('|');
    return referrers[referrers.length - 1];
  };

  // Core Functions
  const validatePixel = async () => {
    const cachedStatus = sessionStorage.getItem(SESSION_KEY);
    if (cachedStatus !== null) {
      return cachedStatus === 'true';
    }

    const validationData = {
      action: ACTIONS.VALIDATE,
      pixelId: PIXEL_ID,
      websiteId: PAGE_DOMAIN,
      visitorId: 'validation_check',
    };

    try {
      const response = await sendHttpRequest(CF_URL, validationData);
      const isActive = response.success && response.isActive;
      sessionStorage.setItem(SESSION_KEY, isActive.toString());
      return isActive;
    } catch (error) {
      console.error('Error validating pixel:', error);
      return false;
    }
  };

  const writeFirestore = async (data) => {
    const visitorId = generateVisitorId();

    const firestoreData = {
      action: ACTIONS.CREATE_VISITOR,
      pixelId: PIXEL_ID,
      websiteId: PAGE_DOMAIN,
      visitorId: visitorId,
      createdAt: Date.now(),
      sourceData: data.sourceData,
    };

    try {
      const response = await sendHttpRequest(CF_URL, firestoreData);

      if (response.success) {
        const cookieData = {
          pixelId: PIXEL_ID,
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
        console.log('✅ SourceLink: Initial visit data saved');
      }
    } catch (error) {
      console.error('Error writing to Firestore:', error);
    }
  };

  const updateFirestoreWithNewSource = async (visitorId, newData) => {
    const updateData = {
      action: ACTIONS.UPDATE_SOURCE,
      pixelId: PIXEL_ID,
      websiteId: PAGE_DOMAIN,
      visitorId: visitorId,
      sourceData: [newData],
    };

    try {
      await sendHttpRequest(CF_URL, updateData);
      console.log('✅ SourceLink: Source data updated');
    } catch (error) {
      console.error('Error updating source data:', error);
    }
  };

  const handleEmailInputs = () => {
    const emailInputs = document.querySelectorAll(
      'input[type="email"], input[name^="email"], input[name*="mail"]',
    );

    emailInputs.forEach((emailInput) => {
      emailInput.addEventListener('blur', async () => {
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
                  action: ACTIONS.UPDATE_EMAIL,
                  pixelId: PIXEL_ID,
                  websiteId: PAGE_DOMAIN,
                  visitorId: visitorId,
                  email: email,
                };
                await sendHttpRequest(CF_URL, data);
                console.log('✅ SourceLink: Email captured');
              }
            } catch (error) {
              console.error('Error processing email update:', error);
            }
          }
        }
      });
    });
  };

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

  const handleFirstVisit = (referrer) => {
    const defaultReferrer =
      referrer && referrer !== PAGE_DOMAIN ? referrer : 'direct';
    handleCookie(defaultReferrer);
  };

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
    const isActive = await validatePixel();
    if (!isActive) {
      console.warn(`🚫 SourceLink disabled - Pixel ${PIXEL_ID} is inactive`);
      return;
    }

    writeToCookie();
    handleEmailInputs();
  };

  // Start the application
  init();
})();

/******/ })()
;