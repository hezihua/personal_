export type ParsedCommand =
  | { type: "task"; prompt: string }
  | { type: "approve"; approvalId: string }
  | { type: "deny"; approvalId: string }
  | { type: "status" };

const APPROVE = /^(?:\/approve|批准)\s+([0-9a-f-]{36})\s*$/i;
const DENY = /^(?:\/deny|拒绝)\s+([0-9a-f-]{36})\s*$/i;
const STATUS = /^(?:\/status|状态)\s*$/i;

export function parseUserCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (STATUS.test(trimmed)) {
    return { type: "status" };
  }
  const approve = trimmed.match(APPROVE);
  if (approve) {
    return { type: "approve", approvalId: approve[1] };
  }
  const deny = trimmed.match(DENY);
  if (deny) {
    return { type: "deny", approvalId: deny[1] };
  }
  return { type: "task", prompt: trimmed };
}
