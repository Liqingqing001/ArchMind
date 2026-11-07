import json
import httpx
import pytest
from app import agent
from app.provider_protocols import response_text
from test_solution_agent import CONNECTION


@pytest.mark.parametrize("url,protocol,normalized", [
    ("https://api.openai.com", "responses", "https://api.openai.com/v1"),
    ("https://api.anthropic.com/v1/messages/", "anthropic", "https://api.anthropic.com/v1"),
    ("https://example.com/v1/responses", "responses", "https://example.com/v1"),
    ("https://example.com/v1/chat/completions", "chat_completions", "https://example.com/v1"),
])
def test_endpoint_normalization(url, protocol, normalized):
    c = agent.ModelConnection(**{**CONNECTION, "base_url": url, "protocol": protocol, "api_key": "  test-key  "})
    assert c.base_url == normalized and c.protocol == protocol
    assert c.api_key.get_secret_value() == "test-key"
    assert "test-key" not in repr(c)


@pytest.mark.parametrize("protocol,output,suffix", [
    ("responses", {"output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"OK"}]}],"status":"completed"}, "/responses"),
    ("anthropic", {"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"OK"}],"stop_reason":"end_turn"}, "/messages"),
    ("chat_completions", {"choices":[{"message":{"content":[{"type":"text","text":"OK"}]},"finish_reason":"stop"}]}, "/chat/completions"),
])
def test_native_protocol_requests_and_responses(monkeypatch, protocol, output, suffix):
    client_type = httpx.Client
    captured = []
    def handle(request):
        captured.append(request)
        return httpx.Response(200, json=output)
    monkeypatch.setattr(agent, "validate_url", lambda *a, **k: None)
    monkeypatch.setattr(agent.httpx, "Client", lambda **kwargs: client_type(transport=httpx.MockTransport(handle), **kwargs))
    c = agent.ModelConnection(**CONNECTION, protocol=protocol, max_output_tokens=3200, token_parameter="max_completion_tokens")
    assert agent.complete(c, [{"role":"system","content":"guidance"},{"role":"user","content":"hello"}]) == ("OK","stop")
    req = captured[0]
    payload = json.loads(req.content)
    assert str(req.url) == CONNECTION["base_url"] + suffix
    assert payload["stream"] is False
    if protocol == "anthropic":
        assert req.headers["x-api-key"] == CONNECTION["api_key"]
        assert req.headers["anthropic-version"] == "2023-06-01"
        assert "authorization" not in req.headers
        assert payload["system"] == "guidance" and payload["messages"][0]["role"] == "user"
        assert payload["max_tokens"] == 3200
    else:
        assert req.headers["authorization"] == "Bearer " + CONNECTION["api_key"]
        if protocol == "responses":
            assert payload["input"][0]["role"] == "system" and payload["store"] is False
            assert payload["max_output_tokens"] == 3200
        else:
            assert payload["max_completion_tokens"] == 3200 and "max_tokens" not in payload


def test_incomplete_and_empty_outputs():
    assert response_text("anthropic", {"content":[{"type":"text","text":"partial"}],"stop_reason":"max_tokens"}) == ("partial","length")
    assert response_text("responses", {"output":[{"type":"message","content":[{"type":"output_text","text":"partial"}]}],"status":"incomplete"}) == ("partial","length")
    for protocol, value in [("responses",{"output":[]}),("anthropic",{"content":[]}),("chat_completions",{"choices":[{"message":{"content":None}}]})]:
        with pytest.raises(ValueError):
            response_text(protocol, value)

