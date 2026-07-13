# loki-auto Rhai 沙箱 API 开发指南

本文档定义了在 Loki 浏览器沙箱内编写 Rhai 自动化脚本的完整 API 规范和最佳实践。

## 核心设计原则
1. **同步执行**：沙箱内的所有 API 均为**同步**且阻塞的。**切勿**在 Rhai 脚本中使用 `await` 关键字。
2. **继承浏览器上下文**：执行沙箱在当前活动浏览器标签页中运行，直接继承已登录的会话、Cookie 和本地凭证，通常无需重复登录。

## Rhai API 列表

* `sleep(ms: i64)`
  - 挂起执行指定的毫秒数。
  
* `log(message: Any)`
  - 将消息输出到执行控制台日志。支持字符串、数字、布尔值及其他对象类型。
  
* `dom_to_string() -> String`
  - 返回经过清理和 Token 优化（AEO 优化）的当前页面 HTML 树，非常适合 LLM 进行分析。
  
* `element_exists(selector: String) -> bool`
  - 立即检查页面中是否存在匹配该 CSS 选择器的元素。
  
* `wait_element(selector: String, [timeout_ms: i64]) -> bool`
  - 阻塞等待元素在 DOM 中出现，若超时则抛出 `TimeoutError`。默认超时时间为 5000 毫秒。
  
* `click(selector: String, [timeout_ms: i64]) -> bool`
  - 等待元素出现并对其执行点击操作。默认超时时间为 5000 毫秒。
  
* `type_text(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - 等待元素出现并立即设置其输入值，触发标准的 input/change 事件。推荐用于大段文本输入、文章粘贴或常规表单填写。默认超时时间为 5000 毫秒。
  
* `type_as_human(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - 等待元素出现，随后模拟人类键盘敲击，以随机延迟（40ms-120ms）逐字输入，并触发标准的 keydown/keyup 事件。推荐用于搜索框输入、登录凭证填写以规避反爬虫检测。默认超时时间为 5000 毫秒。
  
* `get_text(selector: String, [timeout_ms: i64]) -> String`
  - 等待元素出现并提取其内部文本内容。默认超时时间为 5000 毫秒。
  
* `get_value(selector: String, [timeout_ms: i64]) -> String`
  - 等待元素出现并提取其表单输入值。默认超时时间为 5000 毫秒。
  
* `get_attribute(selector: String, attr: String, [timeout_ms: i64]) -> String`
  - 等待元素出现并提取指定属性的值。默认超时时间为 5000 毫秒。
  
* `scroll_to(selector: String, [timeout_ms: i64]) -> bool`
  - 等待元素出现并平滑滚动视口，使其在屏幕居中对齐。默认超时时间为 5000 毫秒。
  
* `get_loki_data(dom_selector: String, [timeout_ms: i64]) -> String`
  - 限定目标 DOM 范围，查询所有带有 `data-loki` 属性的子元素并返回一个格式化好的 Markdown 结构大纲。默认超时时间为 5000 毫秒。

## 代码示例

### 示例 1: 模拟真人打字进行谷歌搜索
```rust
print("正在等待搜索框...");
if wait_element("textarea[name='q']", 3000) {
  // 使用 type_as_human 模拟真实打字
  type_as_human("textarea[name='q']", "weather in Boston today");
  sleep(500);
  click("input[name='btnK']");
}
```

### 示例 2: 滚动以解析懒加载列表并获取 DOM 长度
```rust
print("正在滚动至底部以加载更多项...");
scroll_to("footer");
sleep(1500); // 等待页面加载
let page_html = dom_to_string();
print("加载的 DOM 大小: " + page_html.len());
```

## ❓ 帮助与资源
若需查看更多详情、进阶脚本编写指南和集成教程，请访问我们的帮助中心：
👉 https://loki4agent.com/docs/help
