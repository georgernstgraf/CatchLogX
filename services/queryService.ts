import { prisma } from "@/lib/prisma";

export function validateSQLQuery(query: string): {
  isValid: boolean;
  error?: string;
} {
  if (!query || typeof query !== "string") {
    return { isValid: false, error: "Query ist leer oder kein String" };
  }

  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { isValid: false, error: "Query ist leer" };
  }

  const dangerousTables = ["USER", "SESSION", "PASSWORDRESETS", "UPLOADS"];

  for (const table of dangerousTables) {
    if (trimmedQuery.toUpperCase().includes(table.toUpperCase())) {
      return {
        isValid: false,
        error: `Gefährliche Operation erkannt: ${table} darf nicht abgefragt werden.`,
      };
    }
  }

  const dangerousKeywords = [
    "DROP",
    "DELETE",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "INSERT",
    "UPDATE",
  ];
  const upperQuery = trimmedQuery.toUpperCase();

  for (const keyword of dangerousKeywords) {
    if (upperQuery.includes(keyword)) {
      return {
        isValid: false,
        error: `Gefährliche Operation erkannt: ${keyword}. Nur SELECT-Queries sind erlaubt.`,
      };
    }
  }

  if (!upperQuery.startsWith("SELECT")) {
    return { isValid: false, error: "Nur SELECT-Queries sind erlaubt" };
  }

  const openParens = (trimmedQuery.match(/\(/g) || []).length;
  const closeParens = (trimmedQuery.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    return {
      isValid: false,
      error: "Ungleiche Anzahl von öffnenden und schließenden Klammern",
    };
  }

  return { isValid: true };
}

export async function executeQuery(query: string) {
  const data = await prisma.$queryRawUnsafe(query);

  const serializedData = JSON.parse(
    JSON.stringify(data, (key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

  return {
    timestamp: new Date(),
    query,
    result: serializedData,
  };
}
