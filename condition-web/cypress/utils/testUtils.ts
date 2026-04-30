import { OidcConfig } from "../../src/utils/config";

export const mockZustandStore = (storeModule, initialState) => {
  const storeResetFn = storeModule.getState().reset;

  storeModule.setState(initialState, true); // Reset the store state to initialState

  // Clean up the mock after each test
  return () => {
    storeResetFn();
  };
};

// Helper to encode object to base64url
const base64Url = (obj: Record<string, unknown>) => {
  const json = JSON.stringify(obj);
  const base64 = btoa(json);
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

// Create dummy JWT
const payload = {
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  sub: "test-sub",
  resource_access: {
    [OidcConfig.client_id]: {
      roles: ["view_conditions", "manage_conditions"],
    },
  },
};

export const mockAccessToken = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url(
  payload
)}.signature`;

export const setupTokenStorage = () => {
  sessionStorage.setItem(
    `oidc.user:${OidcConfig.authority}:${OidcConfig.client_id}`,
    JSON.stringify({
      access_token: mockAccessToken,
    }),
  );
};

export const mockAuth = {
  isAuthenticated: true,
  user: {
    profile: {
      name: "Test User",
      identity_provider: "idir",
      sub: "test-sub",
    },
    access_token: mockAccessToken,
    id_token: "mock_id_token",
    session_state: "mock_session_state",
    token_type: "Bearer",
    expires_in: 3600,
    toStorageString: () => "",
  },
  signoutRedirect: () => Promise.resolve(),
  signinRedirect: () => Promise.resolve(),
  isLoading: false,
  settings: {
    authority: "https://test-issuer",
    client_id: OidcConfig.client_id,
    redirect_uri: "http://localhost/callback",
  },
  events: {} as Record<string, (...args: unknown[]) => void>,
};
