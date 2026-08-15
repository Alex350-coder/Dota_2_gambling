import type { BetOrder } from "../betting/order";
import type { Repository } from "./repository";

export type BetOrderRepository = Repository<BetOrder, string>;
