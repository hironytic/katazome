/*{% ktzm.outputFilePath = "I" + cc.toPascalCase(ktzm.answer.name) + "Repository.cs"; %}*/
/*{%
const NamePascal = cc.toPascalCase(ktzm.answer.name);
const NameCamel = cc.toCamelCase(ktzm.answer.name);
const ns = ktzm.answer.namespace;
%}*/
namespace ZZns__;

public interface IZZNamePascal__Repository
{
    Task<ZZNamePascal__?> FindByIdAsync(int id);
    Task<IEnumerable<ZZNamePascal__>> GetAllAsync();
    Task<ZZNamePascal__> AddAsync(ZZNamePascal__ zzNameCamel__);
    Task UpdateAsync(ZZNamePascal__ zzNameCamel__);
    Task DeleteAsync(int id);
}
