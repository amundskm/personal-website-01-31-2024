import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from '$amplify/env/finances';
import { hasAnyRole } from '../../../src/app/core/auth/roles';
import {
  type FinancesAdminData,
  type FinancesDashboard,
  type NewRule,
  type PlanCategory,
  type SpendingPlan,
  type Statement,
  summarizeMonths,
  toInfo,
  validateStatement,
} from '../../../src/app/core/finances/finances';
import { SPENDING_PLAN_QUERY } from '../../../src/app/core/queries';
import type { SPENDING_PLAN_QUERY_RESULT } from '../../../src/app/core/sanity.types';
import { callerGroups, json } from '../shared/http';
import { sanityClient } from '../shared/sanity';

const TABLE = process.env['FINANCES_TABLE']!;
const PLAN_ID = 'spendingPlan';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sanity = sanityClient(env.SANITY_DATASET, env.SANITY_WRITE_TOKEN);

/**
 * GET    /finances                  (wife)  → plan budgets + monthly totals, no transactions or rules
 * GET    /finances/admin            (admin) → full plan incl. merchant patterns + uploaded statements
 * PUT    /finances/statements/{id}  (admin) → save (or replace) a statement; body { statement, newRules }
 * DELETE /finances/statements/{id}  (admin) → remove an uploaded statement
 *
 * Admins pass every check (see hasAnyRole).
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const groups = callerGroups(event);
  const isAdmin = groups.includes('admin');
  const id = event.pathParameters?.['id'] ?? '';

  try {
    switch (event.routeKey) {
      case 'GET /finances':
        if (!hasAnyRole(groups, ['wife'])) return forbidden();
        return json(200, await dashboard());

      case 'GET /finances/admin':
        if (!isAdmin) return forbidden();
        return json(200, await adminData());

      case 'PUT /finances/statements/{id}': {
        if (!isAdmin) return forbidden();
        const body = parseBody(event.body);
        const error = validateStatement(body?.statement, id);
        if (error) return json(400, { message: error });
        const statement: Statement = {
          ...(body.statement as Statement),
          id,
          uploadedAt: new Date().toISOString(),
        };
        await db.send(new PutCommand({ TableName: TABLE, Item: statement }));
        await rememberRules(Array.isArray(body.newRules) ? body.newRules : []);
        return json(200, toInfo(statement));
      }

      case 'DELETE /finances/statements/{id}':
        if (!isAdmin) return forbidden();
        await db.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
        return json(200, { id });

      default:
        return json(404, { message: 'Not found' });
    }
  } catch (error) {
    console.error(error);
    return json(502, { message: 'Finances could not be loaded.' });
  }
};

async function dashboard(): Promise<FinancesDashboard> {
  const [plan, statements] = await Promise.all([loadPlan(), loadStatements()]);
  return {
    categories: plan.categories.map(({ key, name, monthlyBudget }) => ({
      key,
      name,
      monthlyBudget,
    })),
    stages: plan.stages,
    months: summarizeMonths(statements, plan),
  };
}

async function adminData(): Promise<FinancesAdminData> {
  const [plan, statements] = await Promise.all([loadPlan(), loadStatements()]);
  return {
    plan,
    statements: statements.map(toInfo).sort((a, b) => b.closingDate.localeCompare(a.closingDate)),
  };
}

async function loadPlan(): Promise<SpendingPlan> {
  const result = await sanity.query<SPENDING_PLAN_QUERY_RESULT>(SPENDING_PLAN_QUERY);
  return {
    categories: (result?.categories ?? []).map((c): PlanCategory => ({
      key: c.key,
      name: c.name ?? 'Unnamed',
      monthlyBudget: c.monthlyBudget ?? 0,
      merchantPatterns: c.merchantPatterns ?? [],
    })),
    stages: (result?.stages ?? [])
      .filter((s) => s.startDate)
      .map((s) => ({
        label: s.label ?? '',
        startDate: s.startDate!,
        monthlyTarget: s.monthlyTarget ?? 0,
      })),
  };
}

async function loadStatements(): Promise<Statement[]> {
  const items: Statement[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...((page.Items ?? []) as Statement[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * Adds merchant patterns to their categories in the plan, moving a pattern
 * that was filed under a different category.
 */
async function rememberRules(rules: NewRule[]): Promise<void> {
  const valid = rules
    .filter((r) => typeof r?.categoryKey === 'string' && typeof r?.pattern === 'string')
    .map((r) => ({ categoryKey: r.categoryKey, pattern: r.pattern.trim().toUpperCase() }))
    .filter((r) => r.pattern.length >= 3 && r.pattern.length <= 80);
  if (!valid.length) return;

  const plan = await loadPlan();
  const known = new Set(plan.categories.map((c) => c.key));
  const mutations = valid.flatMap(({ categoryKey, pattern }) => {
    if (!known.has(categoryKey)) return [];
    const others = plan.categories.filter(
      (c) =>
        c.key !== categoryKey &&
        c.merchantPatterns?.some((p) => p.trim().toUpperCase() === pattern),
    );
    const target = plan.categories.find((c) => c.key === categoryKey)!;
    const alreadyThere = target.merchantPatterns?.some((p) => p.trim().toUpperCase() === pattern);
    const path = `categories[_key=="${categoryKey}"].merchantPatterns`;
    return [
      ...others.map((c) => ({
        patch: {
          id: PLAN_ID,
          unset: [`categories[_key=="${c.key}"].merchantPatterns[@ == ${JSON.stringify(pattern)}]`],
        },
      })),
      ...(alreadyThere
        ? []
        : [
            {
              patch: {
                id: PLAN_ID,
                setIfMissing: { [path]: [] },
                insert: { after: `${path}[-1]`, items: [pattern] },
              },
            },
          ]),
    ];
  });
  if (mutations.length) await sanity.mutate(mutations);
}

function parseBody(body: string | undefined): { statement?: unknown; newRules?: NewRule[] } {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

const forbidden = () => json(403, { message: "You don't have access to this." });
