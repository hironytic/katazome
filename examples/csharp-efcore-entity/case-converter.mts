function toWords(input: string): string[] {
  return input
    .split(/[\s_]+/)
    .flatMap((part) =>
      part
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(" "),
    )
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

export function toPascalCase(input: string): string {
  return toWords(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function toCamelCase(input: string): string {
  return toWords(input)
    .map((word, i) =>
      i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
}

export function toSnakeCase(input: string): string {
  return toWords(input).join("_");
}
