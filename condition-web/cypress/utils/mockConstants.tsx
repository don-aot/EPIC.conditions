import { EPIC_CONDITION_ROLE } from "../../src/models/Role";
import { mockAccessToken } from "./testUtils";


export const mockAuthentication = {
  isAuthenticated: true,
  user: {
    profile: {
      name: "Test User",
      identity_provider: "idir",
      sub: "test-sub",
      iss: "https://test-issuer",
      aud: "test-audience",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    access_token: mockAccessToken,
    session_state: "mock_session_state",
    token_type: "Bearer",
    state: {},
    expires_in: 3600,
    scope: "openid profile",
    id_token: "mock_id_token",
    refresh_token: "mock_refresh_token",
    expired: false,
    scopes: ["openid", "profile"],
    toStorageString: () => "",
  },
  signoutRedirect: () => Promise.resolve(),
  signinRedirect: () => Promise.resolve(),
  isLoading: false,
  // Mock required AuthContextProps properties
  settings: {
    authority: "https://test-issuer",
    client_id: "test-client-id",
    redirect_uri: "http://localhost/callback",
  },
  /* eslint-disable @typescript-eslint/no-explicit-any */
  events: {} as any,
  clearStaleState: () => Promise.resolve(),
  removeUser: () => Promise.resolve(),
  signoutSilent: () => Promise.resolve(),
  signinSilent: () => Promise.resolve(null),
  signinPopup: () =>
    Promise.resolve({
      profile: { name: "Test User", identity_provider: "idir" },
      expired: false,
      scopes: ["openid", "profile"],
      toStorageString: () => "",
    } as any),
  signoutPopup: () => Promise.resolve(),
  startSilentRenew: () => Promise.resolve(),
  stopSilentRenew: () => Promise.resolve(),
  error: undefined,
  // Add missing AuthContextProps properties
  signinResourceOwnerCredentials: () =>
    Promise.resolve({
      profile: { name: "Test User", identity_provider: "idir" },
      expired: false,
      scopes: ["openid", "profile"],
      toStorageString: () => "",
    } as any),
  /* eslint-enable @typescript-eslint/no-explicit-any */
  querySessionStatus: () => Promise.resolve(null),
  revokeTokens: () => Promise.resolve(),
};

export const mockStaffAccount = {
  isLoading: false,
  roles: [
    EPIC_CONDITION_ROLE.view_conditions,
  ],
};

export const mockStaffUser = {
  auth_guid: "test-sub",
  first_name: "EAO",
  full_name: "EAO TEST2",
  id: 1,
  last_name: "TEST2",
  position: "",
  work_contact_number: "",
  work_email_address: "eao.test2@gov.bc.ca",
};

export const mockProjects = [
  {
    documents: [
      {
        amendment_count: 1,
        date_issued: "2024-01-11",
        document_category: "Certificate and Amendments",
        document_category_id: "1",
        document_types: ["Certificate"],
        is_latest_amendment_added: true,
        status: false,
      },
    ],
    project_id: "c668a5210cdd8a970fb42722",
    project_name: "Project Name",
  },
];

export const mockDocumentTypes = [
  { id: 1, document_type: "Certificate", categories: [{ id: 1, category_name: "Certificate and Amendments" }] },
  { id: 2, document_type: "Exemption Order", categories: [{ id: 2, category_name: "Exemption Order and Amendments" }] },
  { id: 3, document_type: "Amendment", categories: [{ id: 1, category_name: "Certificate and Amendments" }, { id: 2, category_name: "Exemption Order and Amendments" }] },
  { id: 4, document_type: "Other Order", categories: [{ id: 3, category_name: "Other Orders" }] },
];

export const mockCategoryData = {
  document_category: "Certificate and Amendments",
  documents: [
    {
      document_id: "c668a5210cdd8a970fb42722",
      document_label: "Schedule B - Table of Conditions",
      is_latest_amendment_added: true,
      status: false,
      year_issued: 2014,
    },
    {
      document_id: "c668a5210cdd8a970fb42723",
      document_label: "Amendment 1",
      status: false,
      year_issued: 2022,
    },
    {
      document_id: "c668a5210cdd8a970fb42724",
      document_label: "Amendment #2",
      status: false,
      year_issued: 2025,
    },
  ],
  project_name: "Project Name",
};

export const mockDocument = {
  document_category: "Certificate and Amendments",
  document_category_id: "1",
  document_id: "c668a5210cdd8a970fb42722",
  document_label: "Schedule B - Table of Conditions",
  document_type_id: 1,
  project_name: "Project Name"
}

export const mockConditions = {
  conditions: [
    {
      amendment_names: "Amendment X",
      condition_attributes: {},
      condition_id: "999",
      condition_name: "Test Condition",
      condition_number: 1,
      condition_text: "This is a dummy condition for testing purposes.",
      is_approved: true,
      is_standard_condition: null,
      subconditions: [
        {
          sort_order: 1,
          subcondition_identifier: "",
          subcondition_text: "Dummy subcondition A",
          subconditions: [],
        },
        {
          sort_order: 2,
          subcondition_identifier: "",
          subcondition_text: "Dummy subcondition B",
          subconditions: [
            {
              sort_order: 3,
              subcondition_identifier: "",
              subcondition_text: "Nested dummy subcondition B.1",
              subconditions: [],
            },
          ],
        },
      ],
      subtopic_tags: ["Testing"],
      topic_tags: ["QA"],
      year_issued: 2025,
    },
  ],
};

export const mockSingleCondition = {
  condition: {
    condition_attributes: {
      independent_attributes: [],
      management_plans: [
        {
          id: "206",
          name: "Plan A",
          is_approved: false,
          is_condition_attributes_approved: false,
          is_topic_tags_approved: false,
          attributes: [
            { id: "1892", key: "Requires consultation", value: "true" },
            { id: "2746", key: "Management plan name(s)", value: "{aaa}" },
            { id: "1888", key: "Management plan acronym(s)", value: null },
            { id: "1893", key: "Parties required to be consulted", value: "{BC Ministry of Environment, BC Ministry of Forests}" },
            { id: "1887", key: "Submitted to EAO for", value: "Satisfaction" },
            { id: "1891", key: "Time associated with submission milestone", value: "90" },
            { id: "1889", key: "Milestone(s) related to plan submission", value: "Construction" },
            { id: "1890", key: "Project phases(s) related to plan implementation", value: "Pre-Construction" },
          ]
        }
      ]
    },
    condition_id: "999",
    condition_name: "Test Condition",
    condition_number: 1,
    condition_text: "This is a dummy condition for testing purposes.",
    is_approved: true,
    requires_management_plan: true,
    subconditions: [
      {
        sort_order: 1,
        subcondition_identifier: "",
        subcondition_text: "This is a dummy condition for testing purposes.",
        subconditions: [],
      },
      {
        sort_order: 2,
        subcondition_identifier: "",
        subcondition_text: "Dummy subcondition B",
        subconditions: [
          {
            sort_order: 3,
            subcondition_identifier: "",
            subcondition_text: "Nested dummy subcondition B.1",
            subconditions: [],
          },
        ],
      },
    ],
    subtopic_tags: ["Testing"],
    topic_tags: ["QA"],
    year_issued: 2025
  },
  document_category: "Certificate and Amendments",
  document_category_id: "1",
  document_label: "Amendment X",
  project_name: "Project Name"
};

export const approveManagementPlanRequest = {
  is_approved: true,
};

export const approveManagementPlanResponse = {
  condition_id: "999",
  id: "206",
  is_approved: true,
  name: "",
};

// cypress/fixtures/conditions.ts
export const mockCreatedCondition = {
  condition: {
    condition_attributes: {},
    condition_id: "522",
    condition_name: null,
    condition_number: null,
    condition_text: null,
    is_approved: false,
    is_standard_condition: null,
    subconditions: [],
    subtopic_tags: null,
    topic_tags: null,
    year_issued: 2014,
  },
  document_category: "Certificate and Amendments",
  document_category_id: "1",
  document_id: "c668a5210cdd8a970fb42722",
  document_label: "Schedule B - Table of Conditions",
  project_id: "c668a5210cdd8a970fb42722",
  project_name: "Project Name",
};
