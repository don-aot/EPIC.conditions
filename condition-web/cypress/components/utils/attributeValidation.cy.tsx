/// <reference types="cypress" />

import {
  extractRequirementFlags,
  validateRequiredAttributes,
} from "../../../src/utils/attributeValidation";
import {
  CONDITION_KEYS,
  managementRequiredKeys,
  consultationRequiredKeys,
  iemRequiredKeys,
} from "../../../src/components/ConditionDetails/ConditionAttribute/Constants";
import { IndependentAttributeModel } from "../../../src/models/ConditionAttribute";

const attr = (key: string, value: string): IndependentAttributeModel => ({
  id: `id-${key}`,
  key,
  value,
});

describe("extractRequirementFlags", () => {
  it("returns false flags when no attributes are present", () => {
    const { isConsultationRequired, isIEMRequired } = extractRequirementFlags([]);
    expect(isConsultationRequired).to.be.false;
    expect(isIEMRequired).to.be.false;
  });

  it("returns false flags when attributes are present but none match the target keys", () => {
    const { isConsultationRequired, isIEMRequired } = extractRequirementFlags([
      attr("some_unrelated_key", "true"),
    ]);
    expect(isConsultationRequired).to.be.false;
    expect(isIEMRequired).to.be.false;
  });

  it("detects consultation required when the attribute value is 'true'", () => {
    const { isConsultationRequired } = extractRequirementFlags([
      attr(CONDITION_KEYS.REQUIRES_CONSULTATION, "true"),
    ]);
    expect(isConsultationRequired).to.be.true;
  });

  it("does not flag consultation required when the value is 'false'", () => {
    const { isConsultationRequired } = extractRequirementFlags([
      attr(CONDITION_KEYS.REQUIRES_CONSULTATION, "false"),
    ]);
    expect(isConsultationRequired).to.be.false;
  });

  it("detects IEM required when the attribute value is 'true'", () => {
    const { isIEMRequired } = extractRequirementFlags([
      attr(CONDITION_KEYS.REQUIRES_IEM_TERMS_OF_ENGAGEMENT, "true"),
    ]);
    expect(isIEMRequired).to.be.true;
  });
});

describe("validateRequiredAttributes", () => {
  it("is valid when nothing is required", () => {
    const result = validateRequiredAttributes({
      attributes: [],
      isManagementRequired: false,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.true;
  });

  it("is invalid when management is required but its keys are missing entirely", () => {
    const result = validateRequiredAttributes({
      attributes: [],
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("is invalid when a required management key's value is blank", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, "   "));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("is valid when management is required and all required keys have values", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, "some value"));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.true;
  });

  it("is invalid when consultation is required but its key is missing", () => {
    const result = validateRequiredAttributes({
      attributes: [],
      isManagementRequired: false,
      isConsultationRequired: true,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("is valid when consultation is required and its keys have values", () => {
    const attributes = consultationRequiredKeys.map((key) => attr(key, "BC Ministry of Environment"));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: false,
      isConsultationRequired: true,
      isIEMRequired: false,
    });
    expect(result).to.be.true;
  });

  it("is invalid when IEM is required but its keys are missing", () => {
    const result = validateRequiredAttributes({
      attributes: [],
      isManagementRequired: false,
      isConsultationRequired: false,
      isIEMRequired: true,
    });
    expect(result).to.be.false;
  });

  it("is valid when IEM is required and all its keys have values", () => {
    const attributes = iemRequiredKeys.map((key) => attr(key, "some value"));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: false,
      isConsultationRequired: false,
      isIEMRequired: true,
    });
    expect(result).to.be.true;
  });

  it("is invalid overall when any one of multiple required sections is incomplete", () => {
    const attributes = [
      ...managementRequiredKeys.map((key) => attr(key, "some value")),
      // consultation keys intentionally omitted
    ];
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: true,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("treats an empty array value as empty", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, [] as unknown as string));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("treats a non-empty array value as populated", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, ["some value"] as unknown as string));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.true;
  });

  it("treats an empty object value as empty", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, {} as unknown as string));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.false;
  });

  it("treats a non-empty object value as populated", () => {
    const attributes = managementRequiredKeys.map((key) => attr(key, { a: 1 } as unknown as string));
    const result = validateRequiredAttributes({
      attributes,
      isManagementRequired: true,
      isConsultationRequired: false,
      isIEMRequired: false,
    });
    expect(result).to.be.true;
  });
});
