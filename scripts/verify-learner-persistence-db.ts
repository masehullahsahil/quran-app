import "dotenv/config";
import mysql from "mysql2/promise";

const requiredTables = [
  "memorization_attempts",
  "qaida_lesson_completions",
  "qaida_progress",
] as const;
const requiredColumns: Record<(typeof requiredTables)[number], string[]> = {
  memorization_attempts: [
    "id",
    "userId",
    "idempotencyKey",
    "sessionId",
    "surah",
    "ayah",
    "attemptedAt",
    "result",
    "score",
    "matchedCount",
    "totalWords",
    "correctionWordIndexesJson",
    "errorsJson",
    "attemptsRequired",
    "eventuallyAdvanced",
    "createdAt",
  ],
  qaida_lesson_completions: ["id", "userId", "lessonId", "completedAt"],
  qaida_progress: ["userId", "currentLessonId", "updatedAt"],
};

function fail(messages: string[]): never {
  console.error("Learner persistence schema is NOT ready:");
  messages.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url)
  fail([
    "DATABASE_URL is not configured (no database connection was attempted).",
  ]);

const connection = await mysql.createConnection(url);
try {
  const [databaseRows] = await connection.query<
    Array<{ databaseName: string }>
  >("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRows[0]?.databaseName;
  if (!databaseName) fail(["DATABASE_URL does not select a database."]);

  const [columns] = await connection.query<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string }>
  >(
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?)",
    [databaseName, ...requiredTables]
  );
  const problems: string[] = [];
  for (const table of requiredTables) {
    const present = new Set(
      columns
        .filter(row => row.TABLE_NAME === table)
        .map(row => row.COLUMN_NAME)
    );
    if (!present.size) problems.push(`missing table ${table}`);
    else
      requiredColumns[table]
        .filter(column => !present.has(column))
        .forEach(column =>
          problems.push(`${table} is missing column ${column}`)
        );
  }

  const [indexes] = await connection.query<
    Array<{
      TABLE_NAME: string;
      INDEX_NAME: string;
      NON_UNIQUE: number;
      columns: string;
    }>
  >(
    "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?) GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE",
    [databaseName, ...requiredTables]
  );
  const requireIndex = (
    table: string,
    name: string,
    columns: string,
    unique?: boolean
  ) => {
    const match = indexes.find(
      index => index.TABLE_NAME === table && index.INDEX_NAME === name
    );
    if (!match) problems.push(`${table} is missing index/constraint ${name}`);
    else if (
      match.columns !== columns ||
      (unique === true && match.NON_UNIQUE !== 0)
    )
      problems.push(`${name} has incompatible columns or uniqueness`);
  };
  requireIndex(
    "memorization_attempts",
    "memorization_attempt_user_key_uq",
    "userId,idempotencyKey",
    true
  );
  requireIndex(
    "memorization_attempts",
    "memorization_attempt_user_ayah_idx",
    "userId,surah,ayah"
  );
  requireIndex(
    "qaida_lesson_completions",
    "qaida_completion_user_lesson_uq",
    "userId,lessonId",
    true
  );
  requireIndex(
    "qaida_lesson_completions",
    "qaida_completion_user_idx",
    "userId"
  );
  requireIndex("qaida_progress", "PRIMARY", "userId", true);

  const [foreignKeys] = await connection.query<
    Array<{
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
      DELETE_RULE: string;
    }>
  >(
    "SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.CONSTRAINT_SCHEMA=? AND k.TABLE_NAME IN (?, ?, ?) AND k.REFERENCED_TABLE_NAME IS NOT NULL",
    [databaseName, ...requiredTables]
  );
  for (const table of requiredTables) {
    const fk = foreignKeys.find(
      key => key.TABLE_NAME === table && key.COLUMN_NAME === "userId"
    );
    if (
      !fk ||
      fk.REFERENCED_TABLE_NAME !== "users" ||
      fk.REFERENCED_COLUMN_NAME !== "id" ||
      fk.DELETE_RULE !== "CASCADE"
    )
      problems.push(
        `${table}.userId must reference users.id with ON DELETE CASCADE`
      );
  }
  const userId = columns.find(
    row => row.TABLE_NAME === "qaida_progress" && row.COLUMN_NAME === "userId"
  )?.COLUMN_TYPE;
  const [userColumns] = await connection.query<Array<{ COLUMN_TYPE: string }>>(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='id'",
    [databaseName]
  );
  if (!userColumns[0] || userColumns[0].COLUMN_TYPE !== userId)
    problems.push(
      "learner userId columns are not structurally compatible with users.id"
    );
  if (problems.length) fail(problems);
  console.log(
    "Learner persistence schema verified: required tables, columns, indexes, uniqueness, and user foreign keys are ready."
  );
} finally {
  await connection.end();
}
