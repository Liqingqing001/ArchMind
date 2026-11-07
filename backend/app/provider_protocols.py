"""Small text-only adapters for the three supported HTTP protocols."""


def request_parts(connection, messages, limit):
    key = connection.api_key.get_secret_value()
    headers = {"Authorization": "Bearer " + key}
    if connection.protocol == "anthropic":
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        payload = {"model": connection.model, "max_tokens": limit, "stream": False,
            "messages": [m for m in messages if m["role"] != "system"]}
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        if system:
            payload["system"] = system
        return "/messages", headers, payload
    if connection.protocol == "responses":
        return "/responses", headers, {"model": connection.model, "input": messages,
            "max_output_tokens": limit, "stream": False, "store": False}
    return "/chat/completions", headers, {"model": connection.model, "messages": messages,
        connection.token_parameter: limit, "stream": False}


def response_text(protocol, data):
    if protocol == "anthropic":
        answer = "\n".join(c["text"] for c in data["content"] if c.get("type") == "text")
        finish = "length" if data.get("stop_reason") == "max_tokens" else "stop"
    elif protocol == "responses":
        answer = "\n".join(c["text"] for item in data["output"] if item.get("type") == "message"
            for c in item.get("content", []) if c.get("type") == "output_text")
        finish = ("content_filter" if (data.get("incomplete_details") or {}).get("reason")=="content_filter" else "length") if data.get("status") == "incomplete" else "stop"
    else:
        answer = data["choices"][0]["message"]["content"]
        if isinstance(answer, list):
            answer = "\n".join(c["text"] for c in answer if c.get("type") == "text")
        finish = data["choices"][0].get("finish_reason")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("No text content")
    return answer, finish
