import { timingSafeEqual } from "node:crypto";

export function isAuthorizedBearer(
  authorization: string | undefined,
  expectedApiKey: string | undefined
): boolean {
  if (!expectedApiKey) return true;
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${expectedApiKey}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
