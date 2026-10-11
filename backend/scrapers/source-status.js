const states = new Map();
export function recordSourceSuccess(source) {
  states.set(source, { status: 'ready', checkedAt: new Date().toISOString(), message: null });
}
export function recordSourceFailure(source, error) {
  states.set(source, { status: error?.upstreamStatus === 403 ? 'blocked' : 'error', checkedAt: new Date().toISOString(), message: error.message });
}
export function sourceSnapshot(source, configured = true) {
  if (!configured) return { status: 'offline', checkedAt: null, message: 'إعدادات المصدر غير موجودة على الخادم' };
  const state = states.get(source);
  if (!state) return { status: 'unchecked', checkedAt: null, message: null };
  if (state.status === 'ready' && Date.now() - Date.parse(state.checkedAt) > 300000) return { ...state, status: 'unchecked' };
  return { ...state };
}
