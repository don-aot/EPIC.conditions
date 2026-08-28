import { mount } from "cypress/react18";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "react-oidc-context";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AppConfig } from "../../../../src/utils/config";
import { routeTree } from "../../../../src/routeTree.gen";
import { mockAuth, setupTokenStorage } from "../../../utils/testUtils";
import {
    approveManagementPlanRequest,
    approveManagementPlanResponse,
    mockAuthentication,
    mockCategoryData,
    mockProjects,
    mockDocumentTypes,
    mockDocument,
    mockConditions,
    mockStaffUser,
    mockSingleCondition,
    mockSingleConditionWithReport,
    mockReports
} from "../../../utils/mockConstants";
import { ThemeProvider } from '@mui/material/styles';
import { theme } from "../../../../src/styles/theme";

describe("conditions details page", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mountDefaultPage = () => {
    const router = createRouter({
      routeTree,
      context: { authentication: mockAuth },
    });

    router.navigate({ to: `/projects` });

    mount(
        <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockAuth}>
            <RouterProvider
              router={router}
              context={{
                authentication: mockAuthentication,
              }}
            />
          </AuthContext.Provider>
        </QueryClientProvider>
        </ThemeProvider>
      );
  };

  beforeEach(() => {
    cy.viewport(1280, 800);
    setupTokenStorage();

    cy.intercept(
      "GET",
      `${AppConfig.apiUrl}/users/guid/${mockStaffUser.auth_guid}`,
      { body: mockStaffUser }
    ).as("getStaffUser");

    queryClient.clear();
  });

  it("fetches and displays single condition when clicked", () => {
    cy.intercept("GET", `${AppConfig.apiUrl}/projects`, {
      body: mockProjects,
    }).as("getProjects");

    cy.intercept("GET", `${AppConfig.apiUrl}/documents/type`, {
      body: mockDocumentTypes,
    }).as("getDocumentTypes");

    cy.intercept("GET", `${AppConfig.apiUrl}/document-category/project/c668a5210cdd8a970fb42722/category/1`, {
        body: mockCategoryData,
    }).as("getDocumentCategory");

    cy.intercept("GET", `${AppConfig.apiUrl}/documents/c668a5210cdd8a970fb42722`, {
        body: mockDocument,
    }).as("getDocument");

    cy.intercept("GET", `${AppConfig.apiUrl}/conditions/project/c668a5210cdd8a970fb42722/document/c668a5210cdd8a970fb42722?include_subconditions=false`, {
        body: mockConditions,
    }).as("getConditions");

    cy.intercept(
        "GET",
        `${AppConfig.apiUrl}/conditions/project/c668a5210cdd8a970fb42722/document/c668a5210cdd8a970fb42722/condition/999`,
        { body: mockSingleCondition }
    ).as("getSingleCondition");

    // Intercept the PATCH request for approving management plan attributes
    cy.intercept(
      "PATCH",
      `${AppConfig.apiUrl}/managementplan/206`,
      (req) => {
        // Assert the request payload
        expect(req.body).to.deep.equal(approveManagementPlanRequest);
        // Mock the response
        req.reply({
          statusCode: 200,
          body: approveManagementPlanResponse,
        });
      }
    ).as("approveManagementPlan");

    mountDefaultPage();

    // Click the "Certificate and Amendments" item
    cy.contains("Certificate and Amendments").click();

    // Wait for API response
    cy.wait("@getDocumentCategory");

    // Assert URL contains expected project/category path
    cy.url().should(
      "include",
      "/documents/project/c668a5210cdd8a970fb42722/document-category/1"
    );

    // Assert that the mock documents are displayed
    cy.contains("Schedule B - Table of Conditions").click();

    // Wait for API response
    cy.wait("@getDocument");
    cy.wait("@getConditions");

    // Assert URL contains expected project/category path
    cy.url().should(
      "include",
      "/conditions/project/c668a5210cdd8a970fb42722/document/c668a5210cdd8a970fb42722"
    );

    // Assert that the mock documents are displayed
    cy.contains("Test Condition").should("exist");

    // Click the condition to load single condition details
    cy.contains("Test Condition").click();

    // Wait for the API call to complete
    cy.wait("@getSingleCondition").its("response.statusCode").should("eq", 200);
  
    // Assert UI contains data from the single condition
    cy.contains("Test Condition").should("exist");
    cy.contains("This is a dummy condition for testing purposes.").should("exist");

    // check the "Condition Attributes" tab ---
    cy.contains("Condition Attributes").click(); // click the tab

    // Assert that the content inside the tab is displayed
    cy.contains("Plan A").should("exist");

    // check the "Condition Attribute"
    cy.contains("Plan A").click(); // click the tab

    // Assert that the content inside the accordian is displayed
    cy.contains("Parties required to be consulted").should("exist");
    cy.contains("BC Ministry of Environment").should("exist");

    // Click the button to approve the management plan attributes
    cy.contains("Confirm Management Plan Attributes").click();

    // Wait for the PATCH request to complete and assert response
    cy.wait("@approveManagementPlan").then((interception) => {
      expect(interception.response?.statusCode).to.eq(200);
      expect(interception.response?.body.is_approved).to.be.true;
      expect(interception.response?.body.condition_id).to.eq("999");
    });

    // Assert that the condition attribute is approved
    cy.contains("Confirmed").should("exist");
    cy.contains("Un-confirm Management Plan Attributes").should("exist");
  });

  it("displays the Reports section for a condition that requires a report", () => {
    cy.intercept("GET", `${AppConfig.apiUrl}/projects`, {
      body: mockProjects,
    }).as("getProjects");

    cy.intercept("GET", `${AppConfig.apiUrl}/documents/type`, {
      body: mockDocumentTypes,
    }).as("getDocumentTypes");

    cy.intercept("GET", `${AppConfig.apiUrl}/document-category/project/c668a5210cdd8a970fb42722/category/1`, {
        body: mockCategoryData,
    }).as("getDocumentCategory");

    cy.intercept("GET", `${AppConfig.apiUrl}/documents/c668a5210cdd8a970fb42722`, {
        body: mockDocument,
    }).as("getDocument");

    cy.intercept("GET", `${AppConfig.apiUrl}/conditions/project/c668a5210cdd8a970fb42722/document/c668a5210cdd8a970fb42722?include_subconditions=false`, {
        body: mockConditions,
    }).as("getConditions");

    cy.intercept(
        "GET",
        `${AppConfig.apiUrl}/conditions/project/c668a5210cdd8a970fb42722/document/c668a5210cdd8a970fb42722/condition/999`,
        { body: mockSingleConditionWithReport }
    ).as("getSingleCondition");

    cy.intercept(
        "GET",
        `${AppConfig.apiUrl}/reports/condition/999`,
        { body: mockReports }
    ).as("getReports");

    mountDefaultPage();

    cy.contains("Certificate and Amendments").click();
    cy.wait("@getDocumentCategory");

    cy.contains("Schedule B - Table of Conditions").click();
    cy.wait("@getDocument");
    cy.wait("@getConditions");

    cy.contains("Test Condition").click();
    cy.wait("@getSingleCondition").its("response.statusCode").should("eq", 200);

    cy.contains("Condition Attributes").click();
    cy.wait("@getReports");

    // Reports section renders with one report grouped under its phase
    cy.contains("Reports").should("exist");
    cy.contains("All Phases").should("exist");

    // Expand the phase accordion to reveal the submission details
    cy.contains("All Phases").click();
    cy.contains("Submission Requirements").should("exist");
    cy.contains("Compliance Notification").should("exist");
    cy.contains("Awaiting Confirmation").should("exist");
    cy.contains("As Needed").should("exist");
    cy.contains("Within 72 hours of non-compliance").should("exist");
  });
});
