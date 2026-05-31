import { describe, expect, test } from "vitest";
import { runGenerate } from "../src/commands/generate.ts";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const exampleDir = new URL("../examples/csharp-efcore-entity/", import.meta.url).pathname;

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = join(tmpdir(), `ktzm-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("example: csharp-efcore-entity", () => {
  test("generates entity and repository files from space-separated name", async () => {
    await withTempDir(async (outputDir) => {
      await runGenerate({
        templatePath: exampleDir,
        outputPath: outputDir + "/",
        answers: ["name=user profile", "namespace=MyApp.Models"],
      });

      expect(existsSync(join(outputDir, "case-converter.mts"))).toBe(false);

      expect(readFileSync(join(outputDir, "UserProfile.cs"), "utf-8")).toBe(
        "using System.ComponentModel.DataAnnotations;\n" +
          "using System.ComponentModel.DataAnnotations.Schema;\n" +
          "using System.Text.Json.Serialization;\n" +
          "\n" +
          "namespace MyApp.Models;\n" +
          "\n" +
          '[Table("user_profile")]\n' +
          "public class UserProfile\n" +
          "{\n" +
          "    [Key]\n" +
          '    [Column("id")]\n' +
          '    [JsonPropertyName("id")]\n' +
          "    public int Id { get; set; }\n" +
          "\n" +
          '    [Column("created_at")]\n' +
          '    [JsonPropertyName("createdAt")]\n' +
          "    public DateTime CreatedAt { get; set; }\n" +
          "\n" +
          '    [Column("updated_at")]\n' +
          '    [JsonPropertyName("updatedAt")]\n' +
          "    public DateTime UpdatedAt { get; set; }\n" +
          "}\n",
      );

      expect(readFileSync(join(outputDir, "IUserProfileRepository.cs"), "utf-8")).toBe(
        "namespace MyApp.Models;\n" +
          "\n" +
          "public interface IUserProfileRepository\n" +
          "{\n" +
          "    Task<UserProfile?> FindByIdAsync(int id);\n" +
          "    Task<IEnumerable<UserProfile>> GetAllAsync();\n" +
          "    Task<UserProfile> AddAsync(UserProfile userProfile);\n" +
          "    Task UpdateAsync(UserProfile userProfile);\n" +
          "    Task DeleteAsync(int id);\n" +
          "}\n",
      );
    });
  });

  test("correctly converts PascalCase entity name", async () => {
    await withTempDir(async (outputDir) => {
      await runGenerate({
        templatePath: exampleDir,
        outputPath: outputDir + "/",
        answers: ["name=OrderItem", "namespace=MyApp.Data"],
      });

      const entityFile = readFileSync(join(outputDir, "OrderItem.cs"), "utf-8");
      expect(entityFile).toContain("namespace MyApp.Data;");
      expect(entityFile).toContain('[Table("order_item")]');
      expect(entityFile).toContain("public class OrderItem");

      const repoFile = readFileSync(join(outputDir, "IOrderItemRepository.cs"), "utf-8");
      expect(repoFile).toContain("public interface IOrderItemRepository");
      expect(repoFile).toContain("Task<OrderItem> AddAsync(OrderItem orderItem);");
    });
  });
});
