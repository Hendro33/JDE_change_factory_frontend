"""The REAL Jade backend with only the language model replaced, at the Agent
SDK boundary, by scripted answers -- for running the journeys without an
Anthropic key or model cost. Everything else -- API, database, gates, the
Architect's live reads through the customer's AIS connection, delivery,
evidence -- is the production code path.

Run it from the backend repository root with the same environment as the
real backend. Use the real backend (uvicorn) to exercise the real AI."""
import json, os, re, sys
sys.path.insert(0, os.path.join(os.getcwd(), "api_service"))
import claude_agent_sdk as sdk
import uvicorn
from jde_api_service.main import app
from jde_api_service.services import architecture_driver
from jde_mcp_server import approval, backlog

_tools = {}
_real_build = architecture_driver.build_discovery_tools


def _spy(*a, **k):
    _tools["t"] = _real_build(*a, **k)
    return _tools["t"]


architecture_driver.build_discovery_tools = _spy


def _result(text):
    return sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=3,
                             session_id="wt", result=text)


def _sys(t):
    return sdk.SystemMessage(subtype="task_started", data={"subagent_type": t})


async def fake_query(prompt, options):
    m = re.search(r"story_id to use throughout, in every tool call: (\S+)", prompt)
    story = m.group(1) if m else None
    if "Use the architect subagent" in prompt:
        t = _tools["t"]
        # The Architect reads what exists today ...
        obs = t.read("processing_option_values", "P4210|CIQ0001")
        t.read("udc_values", "00/DT")
        # ... and the Functional Agent proposes the configuration change set.
        approval.propose_change(story, {
            "tool": "configuration_change_set", "test_orchestration": "ORCH_SO",
            "summary": "Webshop orders get their own order type SW, set up like SO",
            "items": [
                {"capability_id": "udc_value_maintenance", "product_code": "00", "udc_type": "DT", "code": "SW",
                 "action": "add", "values": {"DRDL01": "Sales Order - Webshop"}, "purpose": "the new order type code"},
                {"capability_id": "document_type_definition", "table": "F40039", "key": {"DCTO": "SW"}, "action": "add",
                 "values": {"DCT4": "SO", "DCDL01": "Sales Order - Webshop"}, "purpose": "document type master, category SO"},
                {"capability_id": "processing_option_update", "application": "P4210", "version": "CIQ0001",
                 "option": "PDOCTYPE", "value": "SW", "purpose": "webshop order entry defaults to SW"},
            ]}, "configuration_change_set")
        summary = {
            "architect_decision": {"recommended_route": "Functional Agent", "confidence": 0.85,
                                   "existing_functionality_found": "P4210 version CIQ0001 (webshop order entry) defaults document type S3; no webshop order type exists in 00/DT",
                                   "alternatives_considered": ["reuse SO for webshop orders"], "objects_affected": ["00/DT", "F40039", "P4210|CIQ0001"],
                                   "dependencies_and_conflicts": [], "rollback_strategy": "set PDOCTYPE back to S3; SW stays unused"},
            "implementation_spec": {"sequence": ["add order type SW to UDC 00/DT", "add document type SW (category SO) to F40039",
                                                 "set processing option PDOCTYPE of P4210|CIQ0001 to SW"],
                                    "required_mcp_operations": ["configuration_change_set"], "human_actions_required": [],
                                    "validation_approach": "create a DEV webshop order and check it is type SW"},
            "evidence": {"observations": [obs.get("observation_id")] if isinstance(obs, dict) else []},
        }
        yield _result("```json\n" + json.dumps(summary) + "\n```")
        return
    if story:
        for t in ("receive-agent", "improve-agent", "check-agent"):
            yield _sys(t)
        summary = {
            "story_id": story,
            "user_story": {
                "statement": "As a webshop order clerk, I want webshop orders to get their own order type SW that behaves like SO, so that the warehouse picks them and we can report on webshop sales.",
                "business_context": "Webshop orders are entered with P4210 version CIQ0001, which defaults to S3 (direct ship).",
                "acceptance_criteria": [{"id": "AC1", "text": "A new webshop order defaults to order type SW and follows the SO flow.", "verified_by": "T1"}],
                "test_script": [{"id": "T1", "action": "Enter a webshop order in DEV", "expected": "Order type is SW"}],
                "open_questions": [], "quality_status": "passed", "revision_count": 0,
            },
            "business_impact": {"financial_impact": "", "operational_reach": "Webshop order desk", "risk_compliance": "",
                                "strategic_alignment": "", "urgency": ""},
            "rough_complexity_signal": "Low", "check_outcome": "proposed_to_backlog", "failed_criteria": [],
        }
        backlog.propose_to_backlog(story, summary["user_story"]["statement"], summary["business_impact"], "Low",
                                   source="Business")
        yield _result("```json\n" + json.dumps(summary) + "\n```")
        return
    yield _result("```json\n{}\n```")


sdk.query = fake_query
uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("JADE_API_PORT", "8000")))
