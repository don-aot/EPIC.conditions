import { WebStorageStateStore } from "oidc-client-ts";

declare global {
  interface Window {
    _env_: {
      VITE_API_URL: string;
      VITE_ENV: string;
      VITE_VERSION: string;
      VITE_APP_TITLE: string;
      VITE_APP_URL: string;
      VITE_APP_BASE_PATH: string;
      VITE_OIDC_AUTHORITY: string;
      VITE_CLIENT_ID: string;
      VITE_SUPPORT_EMAIL: string;
      VITE_OBJECT_STORAGE_URL: string;
      VITE_CONDITION_DOCUMENTS_FOLDER: string;
      VITE_EAO_SEARCH_URL: string;
    VITE_ENABLE_NEW_SUBMIT_FLOW: string;
      VITE_CENTRE_API_URL: string;
    };
  }
}
const API_URL =
  window._env_?.VITE_API_URL || import.meta.env.VITE_API_URL || "";
const APP_ENVIRONMENT =
  window._env_?.VITE_ENV || import.meta.env.VITE_ENV || "";
const APP_VERSION =
  window._env_?.VITE_VERSION || import.meta.env.VITE_VERSION || "";
const APP_TITLE =
  window._env_?.VITE_APP_TITLE || import.meta.env.VITE_APP_TITLE || "";
const APP_URL = window._env_?.VITE_APP_URL || import.meta.env.VITE_APP_URL;
const APP_BASE_PATH = window._env_?.VITE_APP_BASE_PATH || import.meta.env.VITE_APP_BASE_PATH;
const OIDC_AUTHORITY =
  window._env_?.VITE_OIDC_AUTHORITY || import.meta.env.VITE_OIDC_AUTHORITY;
const CLIENT_ID =
  window._env_?.VITE_CLIENT_ID || import.meta.env.VITE_CLIENT_ID;
const SUPPORT_EMAIL =
  window._env_?.VITE_SUPPORT_EMAIL || import.meta.env.VITE_SUPPORT_EMAIL;
const OBJECT_STORAGE_URL =
  window._env_?.VITE_OBJECT_STORAGE_URL || import.meta.env.VITE_OBJECT_STORAGE_URL || "";
const CONDITION_DOCUMENTS_FOLDER =
  (
    window._env_?.VITE_CONDITION_DOCUMENTS_FOLDER ||
    import.meta.env.VITE_CONDITION_DOCUMENTS_FOLDER ||
    ""
  ).trim() || "condition_extraction_documents";
const ENABLE_NEW_SUBMIT_FLOW =
  (window._env_?.VITE_ENABLE_NEW_SUBMIT_FLOW || import.meta.env.VITE_ENABLE_NEW_SUBMIT_FLOW || "false").toLowerCase() === "true";
const EAO_SEARCH_URL =
  window._env_?.VITE_EAO_SEARCH_URL || import.meta.env.VITE_EAO_SEARCH_URL || "https://projects.eao.gov.bc.ca/api/search";
const CENTRE_API_URL =
  window._env_?.VITE_CENTRE_API_URL || import.meta.env.VITE_CENTRE_API_URL || "";

export const AppConfig = {
  apiUrl: `${API_URL}`,
  documentUrl: OBJECT_STORAGE_URL,
  conditionDocumentsFolder: CONDITION_DOCUMENTS_FOLDER,
  eaoSearchUrl: EAO_SEARCH_URL,
  centreApiUrl: `${CENTRE_API_URL}`,
  environment: APP_ENVIRONMENT,
  version: APP_VERSION,
  appTitle: APP_TITLE,
  appUrl: APP_URL,
  appBasePath: APP_BASE_PATH,
  clientId: CLIENT_ID,
  supportEmail: SUPPORT_EMAIL,
  enableNewSubmitFlow: ENABLE_NEW_SUBMIT_FLOW,
};

export const OidcConfig = {
  authority: OIDC_AUTHORITY,
  kc_idp_hint: "idir",
  client_id: CLIENT_ID,
  redirect_uri: `${APP_URL}${APP_BASE_PATH || ''}/oidc-callback`,
  post_logout_redirect_uri: `${APP_URL}${APP_BASE_PATH || ''}/`,
  scope: "openid profile email",
  revokeTokensOnSignout: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
};
