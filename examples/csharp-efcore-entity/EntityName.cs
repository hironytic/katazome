/*{% ktzm.outputFilePath = cc.toPascalCase(ktzm.answer.name) + ".cs"; %}*/
/*{%
const NamePascal = cc.toPascalCase(ktzm.answer.name);
const _name_snake = cc.toSnakeCase(ktzm.answer.name);
const ns = ktzm.answer.namespace;
%}*/
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace ZZns__;

[Table("zz_name_snake__")]
public class ZZNamePascal__
{
    [Key]
    [Column("id")]
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [Column("created_at")]
    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}
