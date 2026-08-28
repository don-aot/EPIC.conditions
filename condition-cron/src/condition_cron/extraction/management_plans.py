"""Management plan extraction used by the cron extraction pipeline."""

import json
import logging

from typing import Any, Dict, Optional

from condition_cron.extraction.client import get_openai_client

logger = logging.getLogger(__name__)

# Matches the phase vocabulary used by condition-web's condition attribute
# dropdowns (see condition-web Constants.ts SELECT_OPTIONS) so extracted
# values land on options staff can actually select/see in the UI.
SUBMISSION_MILESTONE_PHASES = [
    "Pre-Construction",
    "Construction",
    "Commissioning",
    "Operations",
    "Care and Maintenance",
    "Decommissioning",
    "Closure",
    "N/A",
]

IMPLEMENTATION_PHASES = SUBMISSION_MILESTONE_PHASES[:-1] + ["All Phases", "N/A"]


def management_plan_required(input_condition_text: str) -> bool:
   
  tools = [
    {
      "type": "function",
      "function": {
        "name": "extract_info",
        "description": "If the condition requires a specific external plan/report/proposal/summary/etc. document to be written, extract the info related to the document.",

        "parameters": {
          "type": "object",
          "properties": {

            "requires_plan": {
              "type": "boolean",
              "description": "Does the condition explicitly state that a specific external plan/report/proposal/etc. document (e.g., air quality management plan, wildlife action plan, pollution mitigation plan, mountain goat proposal, frog monitoring report) should be written/submitted? If a condition only outlines how plans should be written/developed/handled or simply references a management plan without requiring one to be written, it should be marked False.",
            },

          },
          "required": ["extract_info"],
        },

      }
    }
  ]
  messages = [{"role": "user", "content": f"Here is the text of a condition:\n\n{input_condition_text}"}]
  client = get_openai_client()
  completion = client.chat.completions.create(
    model="gpt-4o-2024-05-13",
    messages=messages,
    tools=tools,
    temperature=0.0,
    tool_choice={"type": "function", "function": {"name": "extract_info"}}
  )

  result = json.loads(completion.choices[0].message.tool_calls[0].function.arguments)

  # If result is not null, return the value of contains_subconditions
  if result:
    return result["requires_plan"]
  
  else:
    logger.error("management_plan_required: result is null")
    return False

def extract_management_plan_info_using_gpt(condition_text: str) -> str:
   
  tools = [
    {
      "type": "function",
      "function": {
        "name": "format_info",
        "description": "Format the information extracted from the condition.",
        "parameters": {
          "type": "object",
          "properties": {
            "deliverables": {
              "type": "array",
              "items": {
                "type": "object",
                  "properties": {
                      "deliverable_name": {
                        "type": "string",
                        "description": "The name of the plan/report/proposal/etc. that the condition is requiring to be written. E.g. Air Quality Mitigation and Monitoring Plan, Marine Water Quality Management and Monitoring Plan for Operations, etc. Write it in title case (E.g. The Catcher in the Rye)."
                      },
                      "management_plan_acronym": {
                        "type": "string",
                        "description": "The acronym for the plan, e.g. 'CEMP' for 'Construction Environmental Management Plan'. If the condition text explicitly defines an acronym for the plan (e.g., in parentheses after its name), use that exactly. Otherwise derive it from the initials of deliverable_name (e.g., 'Care and Maintenance Plan' -> 'CMP'), ignoring minor words like 'and', 'for', 'the'. Null if deliverable_name has no reasonable acronym."
                      },
                      "is_plan": {
                        "type": "boolean",
                        "description": "Whether or not the deliverable is a \"Plan\" document (e.g., Management Plan, Monitoring Plan, Mitigation Plan, etc.). False if not specified."
                      },
                      "is_iem_terms_of_engagement": {
                        "type": "boolean",
                        "description": (
                            "True only if this deliverable IS the Independent Environmental Monitor (IEM) "
                            "Terms of Engagement / Terms of Reference document itself — the document that "
                            "defines the IEM's role, responsibilities, authority, and reporting relationship. "
                            "False for any other plan or report, even one the IEM is involved in preparing, "
                            "reviewing, or implementing, and false for ordinary environmental monitoring plans "
                            "that are not specifically about defining the IEM's own terms of engagement."
                        ),
                      },
                      "approval_type": {
                        "type": "string",
                        "enum": ["Review", "Acceptance", "Satisfaction", "Approval", "Other"],
                        "description": (
                            "The type of approval required for the plan/report/proposal/etc. Consider the "
                            "ENTIRE condition, not just the sentence where the document is first provided to "
                            "the EAO — the true approval standard is often stated in a later clause about how "
                            "the plan takes effect or must be implemented (e.g., 'the plan has no effect until "
                            "approved by the EAO', 'must be developed to the satisfaction of the EAO'). Apply "
                            "this priority, using the STRONGEST standard stated anywhere in the condition: "
                            "\"Approval\" if any clause says the plan must be approved by the EAO, or has no "
                            "effect / cannot proceed until approved. \"Acceptance\" if a clause requires the "
                            "EAO's acceptance. \"Satisfaction\" if a clause requires the plan (or its "
                            "development/implementation) to be to the satisfaction of the EAO. \"Review\" ONLY "
                            "if the sole approval-related language anywhere in the condition is that the "
                            "document is provided for the EAO's review, with no stronger standard stated "
                            "elsewhere — this is also the default when no approval standard is stated at all. "
                            "\"Other\" for any other explicit approval language that doesn't fit the above."
                        ),
                      },
                      "stakeholders_to_consult": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "description": "The names of the stakeholders that the condition explicitly states that the plan/report/proposal/etc. must be developed in consultation with. Often includes government agencies, First Nations, etc. E.g. MOE, MOH, OGC, VCH, Aboriginal Groups, Semiahmoo First Nation, etc."
                        },
                      },
                      "stakeholders_to_submit_to": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "description": "The names of the stakeholders that the condition explicitly states should receive the plan/report/proposal/etc.. Often includes the EAO, other government agencies, First Nations, etc. E.g. MOE, MOH, OGC, VCH, Aboriginal Groups, Semiahmoo First Nation, etc."
                        },
                      },
                      "fn_consultation_required": {
                        "type": "boolean",
                        "description": "Whether the plan/report/proposal/etc. requires consultation with indigenous nations/First Nations/aboriginal peoples, etc. False if not explicitly specified."
                      },
                      "related_phase": {
                        "type": "string",
                        "enum": SUBMISSION_MILESTONE_PHASES,
                        "description": "The project phase that the plan/report/proposal/etc.'s SUBMISSION due date is related to (e.g., the phase referenced in 'a minimum of X days prior to the planned commencement of ___'). Use 'N/A' if not tied to a specific phase, or null if not specified at all."
                      },
                      "submission_time_value": {
                        "type": "integer",
                        "description": "The numeric magnitude of time relative to the milestone that the plan/report/proposal/etc. must be provided to the EAO (e.g., 60 for 'a minimum of 60 days prior to...', 30 for 'within 30 days after...'). Always non-negative — use submission_time_direction for before/after, not a negative number. Null if not specified."
                      },
                      "submission_time_unit": {
                        "type": "string",
                        "enum": ["Days", "Month(s)", "Year(s)"],
                        "description": "The unit for submission_time_value. Null if not specified."
                      },
                      "submission_time_direction": {
                        "type": "string",
                        "enum": ["Before", "After", "Prior to"],
                        "description": "Whether submission is due before or after the milestone. Use 'Prior to' when the condition text literally says 'prior to'. Use 'Before' for other before-the-milestone phrasing (e.g., 'a minimum of X days before'). Use 'After' for after-the-milestone phrasing (e.g., 'within X days after/following'). Null if not specified."
                      },
                      "implementation_phase": {
                        "type": "string",
                        "enum": IMPLEMENTATION_PHASES,
                        "description": "The project phase(s) DURING WHICH the plan itself must be implemented/carried out (distinct from related_phase, which is about when the plan must be SUBMITTED). Look for language like 'must be implemented during/throughout ___'. Use 'All Phases' if implementation spans the whole project, 'N/A' if not tied to a specific phase, or null if not specified at all."
                      },
                  },
                  "required": ["deliverable_name", "approval_type", "stakeholders_to_consult", "related_phase", "submission_time_value", "submission_time_unit", "submission_time_direction", "implementation_phase"],
              }
            }
          },
          "required": ["deliverables"],
        },
      }
    }
  ]
  messages = [{"role": "user", "content": f"Here is a condition written by the Environmental Assessment Office:\n\n{condition_text}\n\nFormat the information related to the management plan."}]

  client = get_openai_client()
  completion = client.chat.completions.create(
      model="gpt-4o-2024-05-13",
      messages=messages,
      tools=tools,
      temperature=0.0,
      tool_choice={"type": "function", "function": {"name": "format_info"}}
  )

  return completion.choices[0].message.tool_calls[0].function.arguments

def extract_management_plan_info(condition_text: str) -> Optional[str]:
    if management_plan_required(condition_text):
        logger.debug("This condition requires a deliverable!")
        return extract_management_plan_info_using_gpt(condition_text)
    else:
        logger.debug("This condition does not require a deliverable.")
        return None

def extract_management_plan_info_from_json(input_json: Dict[str, Any]) -> Dict[str, Any]:
    for condition in input_json.get("conditions", []):
        logger.info("Checking if condition %s requires deliverable(s):", condition.get('condition_number'))

        condition_name = condition["condition_name"] + "\n\n" if condition["condition_name"] else ""
        condition_text = condition_name + condition["condition_text"]
        management_plan_info = extract_management_plan_info(condition_text)

        if management_plan_info is not None:
            condition["deliverables"] = json.loads(management_plan_info)["deliverables"]
        else:
            condition["deliverables"] = []

    return input_json
