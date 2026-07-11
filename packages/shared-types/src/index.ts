export interface TabMetadata {
  id: number;
  url: string;
  title: string;
  isFocused: boolean;
  profile?: string;
}

export interface OneshotTaskInput {
  task_id: string;
  target_tab_id?: number;
  target_url_pattern?: string;
  rhai_script: string;
  payload: any;
}

export interface OneshotTaskOutput {
  task_id: string;
  success: boolean;
  data: any;
  logs: string[];
}

export type LokiMessage =
  | { type: "LOKI_TAB_REGISTER"; url: string; title: string }
  | { type: "LOKI_EXECUTE_ONESHOT"; task_id: string; target_tab_id?: number; target_url_pattern?: string; rhai_script: string; payload: any }
  | { type: "LOKI_EXECUTE_ONESHOT_RESPONSE"; task_id: string; success: boolean; data: any; logs: string[] }
  | { type: "LOKI_OPEN_TAB"; url: string; active: boolean; task_id: string }
  | { type: "LOKI_CLOSE_TAB"; tab_id: number; task_id: string }
  | { type: "LOKI_ACTIVATE_TAB"; tab_id: number; task_id: string }
  | { type: "LOKI_COMMAND_RESPONSE"; task_id: string; success: boolean; data: any }
  | { type: "LOKI_TAB_LIST_UPDATE"; tabs: TabMetadata[] };
