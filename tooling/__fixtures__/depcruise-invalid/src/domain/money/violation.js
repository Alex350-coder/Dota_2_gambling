// RULE-A01 fixture violation: the domain layer must not import from src/infra/**.
import { connect } from "../../infra/index.js";

export function readBalance() {
  return connect();
}
