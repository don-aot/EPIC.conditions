/// <reference types="cypress" />

import type { AxiosError } from "axios";
import { requestAxios, submitRequest } from "../../../src/utils/axiosUtils";

describe("requestAxios", () => {
  it("resolves with the response data on success", () => {
    cy.intercept("GET", "https://example.test/success", {
      statusCode: 200,
      body: { ok: true },
    }).as("success");

    cy.wrap(requestAxios({ url: "https://example.test/success", method: "get" })).should(
      "deep.equal",
      { ok: true }
    );
  });

  it("throws a network error message when there is no response", () => {
    cy.intercept("GET", "https://example.test/network-fail", {
      forceNetworkError: true,
    }).as("networkFail");

    cy.wrap(
      requestAxios({ url: "https://example.test/network-fail", method: "get" }).catch(
        (err: Error) => err.message
      )
    ).should("eq", "Network error or CORS issue");
  });

  it("throws the server's error message when the response contains one", () => {
    cy.intercept("GET", "https://example.test/server-error", {
      statusCode: 500,
      body: { message: "Custom server error" },
    }).as("serverError");

    cy.wrap(
      requestAxios({ url: "https://example.test/server-error", method: "get" }).catch(
        (err: AxiosError<{ message: string }>) => err.response?.data?.message
      )
    ).should("eq", "Custom server error");
  });

  it("falls back to the axios error message when the response has no message field", () => {
    cy.intercept("GET", "https://example.test/server-error-no-message", {
      statusCode: 500,
      body: {},
    }).as("serverErrorNoMessage");

    cy.wrap(
      requestAxios({ url: "https://example.test/server-error-no-message", method: "get" }).catch(
        (err: Error) => err.message
      )
    ).should("be.a", "string");
  });
});

describe("submitRequest", () => {
  it("throws before making a request when no access token is stored", () => {
    cy.window().then((win) => win.sessionStorage.clear());

    cy.wrap(
      submitRequest({ url: "/whatever", method: "get" }).catch((err: Error) => err.message)
    ).should("eq", "No access token");
  });
});
