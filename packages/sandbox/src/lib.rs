use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;
use rhai::{Engine, EvalAltResult, Dynamic};
use std::rc::Rc;

#[wasm_bindgen(module = "/src/dom_bridge.js")]
extern "C" {
    fn loki_sleep(ms: i32) -> bool;
    fn loki_element_exists(selector: &str) -> bool;
    fn loki_click(selector: &str) -> bool;
    fn loki_type_text(selector: &str, text: &str) -> bool;
    fn loki_type_as_human(selector: &str, text: &str) -> bool;
    fn loki_get_text(selector: &str) -> String;
    fn loki_get_value(selector: &str) -> String;
    fn loki_get_attribute(selector: &str, attr: &str) -> String;
    fn loki_scroll_to(selector: &str) -> bool;
    fn loki_get_loki_data(dom_selector: &str) -> String;
    fn loki_dom_to_string() -> String;
}

fn wait_element_sync(selector: String, timeout: i64) -> Result<bool, Box<EvalAltResult>> {
    let start = js_sys::Date::now();
    while js_sys::Date::now() - start < timeout as f64 {
        if loki_element_exists(&selector) {
            return Ok(true);
        }
        loki_sleep(50);
    }
    Err(Box::new(EvalAltResult::ErrorRuntime(
        format!("TimeoutError: Element '{}' not found within {}ms", selector, timeout).into(),
        rhai::Position::NONE,
    )))
}

fn click_sync(selector: String, timeout: i64) -> Result<bool, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    if loki_click(&selector) {
        Ok(true)
    } else {
        Err(Box::new(EvalAltResult::ErrorRuntime(
            format!("ClickError: Failed to click element '{}'", selector).into(),
            rhai::Position::NONE,
        )))
    }
}

fn type_text_sync(selector: String, text: String, timeout: i64) -> Result<bool, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    if loki_type_text(&selector, &text) {
        Ok(true)
    } else {
        Err(Box::new(EvalAltResult::ErrorRuntime(
            format!("TypeError: Failed to type into element '{}'", selector).into(),
            rhai::Position::NONE,
        )))
    }
}

fn type_as_human_sync(selector: String, text: String, timeout: i64) -> Result<bool, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    if loki_type_as_human(&selector, &text) {
        Ok(true)
    } else {
        Err(Box::new(EvalAltResult::ErrorRuntime(
            format!("TypeError: Failed to type into element '{}' as human", selector).into(),
            rhai::Position::NONE,
        )))
    }
}

fn get_text_sync(selector: String, timeout: i64) -> Result<String, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    Ok(loki_get_text(&selector))
}

fn get_value_sync(selector: String, timeout: i64) -> Result<String, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    Ok(loki_get_value(&selector))
}

fn get_attribute_sync(selector: String, attr: String, timeout: i64) -> Result<String, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    Ok(loki_get_attribute(&selector, &attr))
}

fn scroll_to_sync(selector: String, timeout: i64) -> Result<bool, Box<EvalAltResult>> {
    wait_element_sync(selector.clone(), timeout)?;
    if loki_scroll_to(&selector) {
        Ok(true)
    } else {
        Err(Box::new(EvalAltResult::ErrorRuntime(
            format!("ScrollError: Failed to scroll to element '{}'", selector).into(),
            rhai::Position::NONE,
        )))
    }
}

fn get_loki_data_sync(dom_selector: String, timeout: i64) -> Result<String, Box<EvalAltResult>> {
    wait_element_sync(dom_selector.clone(), timeout)?;
    Ok(loki_get_loki_data(&dom_selector))
}

fn register_dom_apis(engine: &mut Engine) {
    // wait_element
    engine.register_fn("wait_element", |selector: String| {
        wait_element_sync(selector, 5000)
    });
    engine.register_fn("wait_element", |selector: String, timeout: i64| {
        wait_element_sync(selector, timeout)
    });

    // click
    engine.register_fn("click", |selector: String| {
        click_sync(selector, 5000)
    });
    engine.register_fn("click", |selector: String, timeout: i64| {
        click_sync(selector, timeout)
    });

    // type_text
    engine.register_fn("type_text", |selector: String, text: String| {
        type_text_sync(selector, text, 5000)
    });
    engine.register_fn("type_text", |selector: String, text: String, timeout: i64| {
        type_text_sync(selector, text, timeout)
    });

    // type_as_human
    engine.register_fn("type_as_human", |selector: String, text: String| {
        type_as_human_sync(selector, text, 5000)
    });
    engine.register_fn("type_as_human", |selector: String, text: String, timeout: i64| {
        type_as_human_sync(selector, text, timeout)
    });

    // get_text
    engine.register_fn("get_text", |selector: String| {
        get_text_sync(selector, 5000)
    });
    engine.register_fn("get_text", |selector: String, timeout: i64| {
        get_text_sync(selector, timeout)
    });

    // get_value
    engine.register_fn("get_value", |selector: String| {
        get_value_sync(selector, 5000)
    });
    engine.register_fn("get_value", |selector: String, timeout: i64| {
        get_value_sync(selector, timeout)
    });

    // get_attribute
    engine.register_fn("get_attribute", |selector: String, attr: String| {
        get_attribute_sync(selector, attr, 5000)
    });
    engine.register_fn("get_attribute", |selector: String, attr: String, timeout: i64| {
        get_attribute_sync(selector, attr, timeout)
    });

    // scroll_to
    engine.register_fn("scroll_to", |selector: String| {
        scroll_to_sync(selector, 5000)
    });
    engine.register_fn("scroll_to", |selector: String, timeout: i64| {
        scroll_to_sync(selector, timeout)
    });

    // get_loki_data
    engine.register_fn("get_loki_data", |dom_selector: String| {
        get_loki_data_sync(dom_selector, 5000)
    });
    engine.register_fn("get_loki_data", |dom_selector: String, timeout: i64| {
        get_loki_data_sync(dom_selector, timeout)
    });

    // element_exists (sync)
    engine.register_fn("element_exists", |selector: String| {
        loki_element_exists(&selector)
    });

    // dom_to_string (sync)
    engine.register_fn("dom_to_string", || {
        loki_dom_to_string()
    });

    // sleep
    engine.register_fn("sleep", |ms: i64| {
        loki_sleep(ms as i32);
    });

    // log
    engine.register_fn("log", |val: Dynamic| {
        web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!("[Loki VM] {}", val.to_string())));
    });
}

#[wasm_bindgen]
pub struct RhaiWasmEngine {
    engine: Rc<Engine>,
    payload: Option<String>,
}

#[wasm_bindgen]
impl RhaiWasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut engine = Engine::new();
        
        engine.on_print(|text| {
            web_sys::console::log_1(&JsValue::from_str(&format!("[Loki VM] {}", text)));
        });

        register_dom_apis(&mut engine);
        
        Self {
            engine: Rc::new(engine),
            payload: None,
        }
    }

    pub fn inject_payload(&mut self, payload_json: &str) {
        self.payload = Some(payload_json.to_string());
    }

    pub fn eval_async(&self, script: String) -> js_sys::Promise {
        let engine = self.engine.clone();
        let payload = self.payload.clone();
        future_to_promise(async move {
            let mut scope = rhai::Scope::new();
            
            if let Some(ref p_str) = payload {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(p_str) {
                    if let Ok(dynamic_val) = rhai::serde::to_dynamic(json_val) {
                        scope.push_constant("payload", dynamic_val);
                    }
                }
            }

            match engine.eval_with_scope::<rhai::Dynamic>(&mut scope, &script) {
                Ok(result) => {
                    let js_str = if result.is_string() {
                        result.into_string().unwrap_or_default()
                    } else if let Ok(json_val) = rhai::serde::from_dynamic::<serde_json::Value>(&result) {
                        serde_json::to_string(&json_val).unwrap_or_else(|_| "{}".to_string())
                    } else {
                        result.to_string()
                    };
                    Ok(JsValue::from_str(&js_str))
                }
                Err(err) => {
                    Err(JsValue::from_str(&format!("EvaluationError: {}", err)))
                }
            }
        })
    }

    pub fn get_filtered_dom(&self) -> String {
        loki_dom_to_string()
    }

    pub fn destroy(self) {
        // Drops the Rc, freeing memory
    }
}
