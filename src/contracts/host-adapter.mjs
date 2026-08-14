const REQUIRED_METHODS = [
  "describeHost",
  "openProject",
  "claimAction",
  "submitArtifact",
  "requestApproval",
  "reportProgress",
  "cancelAction"
];

export function assertHostAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("HostAdapter 必须是对象");
  }
  if (!adapter.id || typeof adapter.id !== "string") {
    throw new Error("HostAdapter 必须声明 id");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(`HostAdapter ${adapter.id} 缺少方法：${method}`);
    }
  }
  return adapter;
}

export function hostAdapterMethods() {
  return [...REQUIRED_METHODS];
}
