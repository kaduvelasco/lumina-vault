# Contribuindo para o Lumina AI Vault

[Read this file in English](CONTRIBUTING.md)

Obrigado pelo seu interesse em contribuir para o Lumina AI Vault! Este projeto segue padrões arquiteturais rigorosos para garantir confiabilidade e facilidade de manutenção.

## 🏗️ Visão Geral da Arquitetura

O projeto é construído com uma **arquitetura modular baseada em handlers**:

- **`src/handlers/`**: Cada ferramenta disponibilizada ao servidor MCP deve ter sua própria classe estendendo `BaseToolHandler`.
- **`src/vault.ts`**: Contém a lógica central para manipulação de arquivos e gerenciamento do vault. Esta camada é totalmente assíncrona.
- **`src/server.ts`**: O ponto de entrada que orquestra os handlers e gerencia a conexão do protocolo MCP.

## 🛠️ Fluxo de Desenvolvimento

### 1. Adicionando uma Nova Ferramenta

1. Crie um novo handler em `src/handlers/NomeDaMinhaFerramentaHandler.ts`.
2. Declare uma constante de esquema **Zod** no nível do módulo para validação de entrada.
3. Estenda `BaseToolHandler` usando `typeof SeuSchema` como parâmetro genérico.
4. Implemente o método `execute`.
5. Registre o novo handler em `src/handlers/index.ts`.

Exemplo de estrutura de handler:

```typescript
import { z } from "zod";
import { BaseToolHandler } from "./base.js";

const MinhaNovaFerramentaInputSchema = z.object({
  alvo: z.string().min(1).describe("Identificador do alvo"),
});

export class MinhaNovaFerramentaHandler extends BaseToolHandler<typeof MinhaNovaFerramentaInputSchema> {
  public readonly name = "minha-nova-ferramenta";
  public readonly description = "Uma frase clara descrevendo o que esta ferramenta faz.";
  public readonly inputSchema = MinhaNovaFerramentaInputSchema;

  async execute(args: z.infer<typeof MinhaNovaFerramentaInputSchema>) {
    try {
      // implementação
      return { content: [{ type: "text", text: "..." }] };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
```

> **Importante:** sempre declare o esquema como `const` antes da classe e use `typeof SchemaConst` como genérico. Não anote o genérico com `z.ZodObject<{...}>` — isso quebra a inferência de tipos com o Zod v4.

### 2. Padrões

- **TypeScript**: Use tipagem estrita. Evite `any` a menos que seja absolutamente necessário (e explique o porquê com um comentário).
- **Assincronismo**: Todas as operações de E/S devem ser assíncronas usando `fs/promises`.
- **Validação**: Use Zod v4 para todos os esquemas de entrada. Adicione `.describe()` em todos os campos.
- **Linting**: Execute `npm run lint` antes de realizar o commit.
- **Formatação**: Usamos Prettier. Use `npm run format` para manter o código consistente.

### 3. Testes

Cada handler deve ter um arquivo de teste correspondente em `src/__tests__/`. Usamos o **Vitest** para os testes.

```bash
# Executar testes
npm test

# Executar testes em modo watch
npm run test:watch
```

## 📝 Processo de Pull Request

1. Faça um Fork do repositório.
2. Crie uma branch para sua funcionalidade (`git checkout -b feature/funcionalidade-incrivel`).
3. Comite suas alterações com mensagens claras.
4. Faça o push para a branch.
5. Abra um Pull Request.

Certifique-se de que seu PR passe em todos os testes de lint e unitários!

---

Feito com ❤️ e IA por [Kadu Velasco](https://github.com/kaduvelasco)
