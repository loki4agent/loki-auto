# loki-auto Rhai Sandbox API Reference Guide

This document defines the complete API specifications and best practices for writing Rhai automation scripts to execute inside the Loki browser sandbox.

## Key Design Principles
1. **Synchronous Execution**: All APIs inside the sandbox are **SYNCHRONOUS** and blocking. **DO NOT** use the `await` keyword in your Rhai scripts.
2. **Inherited Browser Context**: The execution sandbox runs in the active browser tab, inheriting logged-in sessions, cookies, and local credentials. No login actions are usually needed.

## Rhai API List

* `sleep(ms: i64)`
  - Suspends execution for the specified milliseconds.
  
* `log(message: Any)`
  - Prints a message to the Execution Console logs. Supports strings, numbers, booleans, and other objects.
  
* `dom_to_string() -> String`
  - Returns a cleaned, token-optimized (AEO-optimized) HTML tree of the current page. Ideal for LLM analysis.
  
* `element_exists(selector: String) -> bool`
  - Immediate check if a element matches the CSS selector in the page.
  
* `wait_element(selector: String, [timeout_ms: i64]) -> bool`
  - Blocks until the element is present in the DOM, or throws a `TimeoutError`. Default timeout: 5000 ms.
  
* `click(selector: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then clicks on it. Default timeout: 5000 ms.
  
* `type_text(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then instantly sets its value. Triggers standard input/change events. Recommended for large texts, pasting articles, or generic forms. Default timeout: 5000 ms.
  
* `type_as_human(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then types character-by-character with randomized human typing delays (40ms-120ms) and standard keydown/keyup events. Recommended for search inputs, login credentials, and bypassing anti-bot systems. Default timeout: 5000 ms.
  
* `get_text(selector: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts its text content. Default timeout: 5000 ms.
  
* `get_value(selector: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts its input value. Default timeout: 5000 ms.
  
* `get_attribute(selector: String, attr: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts the value of the specified attribute. Default timeout: 5000 ms.
  
* `scroll_to(selector: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then scrolls the viewport smoothly to align it in the center. Default timeout: 5000 ms.
  
* `get_loki_data(dom_selector: String, [timeout_ms: i64]) -> String`
  - Scopes the target element, queries all child elements bearing `data-loki` attributes, and returns a clean, Markdown-friendly outline description. Default timeout: 5000 ms.

## Code Examples

### Example 1: Google Search with Human Typing
```rust
print("Waiting for search box...");
if wait_element("textarea[name='q']", 3000) {
  // Use type_as_human to simulate real typing
  type_as_human("textarea[name='q']", "weather in Boston today");
  sleep(500);
  click("input[name='btnK']");
}
```

### Example 2: Parsing lazy loaded listings with scrolling
```rust
print("Scrolling to bottom to load more items...");
scroll_to("footer");
sleep(1500); // Wait for content load
let page_html = dom_to_string();
print("DOM size loaded: " + page_html.len());
```

## ❓ Help & Resources
For more details, advanced scripting guides, and integration tutorials, please visit our help center:
👉 https://loki4agent.com/docs/help
