export type FeedbackTone = "success" | "info" | "warning";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type PromptOptions = {
  title: string;
  message?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type FeedbackApi = {
  alert: (title: string, message?: string) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  notify: (message: string, options?: { tone?: FeedbackTone; durationMs?: number }) => void;
};

let externalApi: FeedbackApi | null = null;
const pendingExternalCalls: Array<(api: FeedbackApi) => void> = [];

function withApi(action: (api: FeedbackApi) => void): void {
  if (externalApi) action(externalApi);
  else pendingExternalCalls.push(action);
}

export function registerFeedbackApi(api: FeedbackApi | null): void {
  externalApi = api;
  if (api) for (const action of pendingExternalCalls.splice(0)) action(api);
}

export function showAppAlert(title: string, message = ""): Promise<void> {
  return new Promise((resolve) => {
    withApi((api) => void api.alert(title, message).then(resolve));
  });
}

export function showAppConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    withApi((api) => void api.confirm(options).then(resolve));
  });
}

export function showAppPrompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    withApi((api) => void api.prompt(options).then(resolve));
  });
}

export function showSnackbar(
  message: string,
  options?: { tone?: FeedbackTone; durationMs?: number },
): void {
  withApi((api) => api.notify(message, options));
}
