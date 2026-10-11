import assert from "node:assert/strict";
import test from "node:test";
import { buildDebtorSearchCriteria } from "../src/repositories/debtors.repository.js";

test("debtor search criteria keeps shared WHERE placeholders and values aligned", () => {
  const criteria = buildDebtorSearchCriteria({
    search: "  account-7 ",
    area: "Area 7",
    locality: "Locality 7",
    route: "Route 7",
    minMonthsPending: 4,
    supplyStatus: "ACTIVE",
  });

  assert.deepEqual(criteria.values, [
    "PILOT_PROVISIONAL",
    "  account-7 ",
    "Area 7",
    "Locality 7",
    "Route 7",
    4,
    "ACTIVE",
  ]);
  assert.match(criteria.where, /^source = \$1 AND/);
  assert.match(criteria.where, /\$2/);
  assert.match(criteria.where, /\$3/);
  assert.match(criteria.where, /\$4/);
  assert.match(criteria.where, /\$5/);
  assert.match(criteria.where, /\$6/);
  assert.match(criteria.where, /\$7/);
  assert.doesNotMatch(criteria.where, /\$8|\$9/);
});
