<p align="center">
  <img src="docs/img/logo.png" alt="Lumina Vault" />
</p>

# Lumina Vault

[![npm version](https://img.shields.io/npm/v/lumina-vault.svg)](https://www.npmjs.com/package/lumina-vault)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-orange.svg)](https://modelcontextprotocol.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUINDO.md)

📄 English version: see [README.md](README.md)

O **Lumina Vault** é um servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) de alta performance que atua como uma **memória persistente e estruturada** para assistentes de IA durante o desenvolvimento de software. Ele permite que modelos de IA mantenham memória de longo prazo dos objetivos do projeto, decisões arquiteturais, stack técnica e progresso ao longo de múltiplas sessões — com suporte completo a **sub-projetos** (plugins, pacotes, módulos) dentro de um mesmo repositório.

## 🚀 Recursos

- **Organização por Projetos e Sub-Projetos** — gerencie múltiplos projetos e sub-projetos aninhados (plugins, módulos, pacotes) de forma independente, cada um com seu próprio vault dedicado.
- **Auto-Descoberta** — resolução em três etapas: lê o `.luminavault.json` do workspace (subindo a árvore de diretórios), cai para o último projeto usado na config global, e orienta o usuário quando nada é encontrado.
- **Detecção de Sub-Projeto** — posicione a IA em qualquer subpasta e ela identifica automaticamente qual sub-projeto (e vault) usar com base no caminho relativo.
- **Caminhos Customizados** — armazene a memória em qualquer lugar do sistema; suporta `~`, `$HOME` e `HOME`. Vaults de sub-projetos têm caminhos totalmente independentes.
- **Escritas Atômicas** — padrão de escrita-e-renomeação que evita corrupção de arquivos.
- **Busca com Contexto** — busca estilo grep com linhas de contexto configuráveis.
- **Monitoramento de Saúde** — ferramenta de auditoria que identifica documentação incompleta.
- **Observabilidade** — logging em tempo real via `stderr` sem quebrar o protocolo MCP.
- **Validação Robusta** — validação rigorosa de schemas de entrada com [Zod](https://zod.dev/).

## 🛠️ Ferramentas

| Ferramenta | Descrição |
|---|---|
| `list_projects` | Lista todos os projetos gerenciados no vault |
| `create_project` | Cria um novo projeto com arquivos de memória padrão |
| `delete_project` | Remove um projeto do vault |
| `list_files` | Lista os arquivos de memória de um projeto; use `metadata=true` para incluir tamanho, tokens estimados e data de modificação |
| `init_project_memory` | Inicialização guiada de um projeto ou sub-projeto |
| `read_memory` | Lê um arquivo de memória |
| `write_memory` | Sobrescreve um arquivo de memória |
| `append_memory` | Adiciona entradas a um arquivo sem sobrescrever. Conteúdo adicionado a `progress.md` ou `decisions.md` deve incluir um cabeçalho de data `## YYYY-MM-DD` |
| `archive_memory` | Move entradas mais antigas que N dias de `progress.md` ou `decisions.md` para um arquivo de arquivo paralelo, mantendo o arquivo ativo enxuto sem perder histórico |
| `delete_memory` | Remove um arquivo de memória customizado |
| `search_memory` | Busca em todo o vault com suporte a linhas de contexto |
| `load_project_context` | Consolida a memória do projeto em um único bloco; use `files` para carregar apenas arquivos específicos |
| `check_project_health` | Audita a completude da memória de um projeto |
| `get_vault_config` | Exibe a configuração atual do vault e as configurações globais |
| `update_project_memory` | Salva o trabalho da sessão no vault em uma única chamada (progresso, decisões, próximos passos, etc.) |

## ⚙️ Auto-Descoberta

Quando `project` não é fornecido explicitamente, todas as ferramentas resolvem o projeto automaticamente em três etapas:

```
1. workspace_root fornecido → sobe a árvore de diretórios até encontrar .luminavault.json
   → verifica o caminho relativo para detectar o sub-projeto ativo
2. Sem .luminavault.json → lê ~/.lumina-vault/config.json (último projeto usado)
3. Nenhum dos dois → retorna mensagem orientando o usuário sobre projeto/vault
```

Toda operação bem-sucedida persiste o projeto ativo como `lastProject` em `~/.lumina-vault/config.json`, para que a próxima sessão o utilize automaticamente.

Quando a auto-descoberta é usada, a resposta inclui uma nota:
- `[project: subprojeto1, from .luminavault.json]` — descoberto da config local
- `[project: subprojeto1, from last session]` — recuperado da config global

## 📁 Projetos e Sub-Projetos

### Projeto Único

O caso mais simples: um projeto por repositório. Execute `init_project_memory` com `workspace_root` e um `.luminavault.json` é criado na raiz do projeto:

```json
{
  "project": "projeto1",
  "path": "HOME/.lumina-vault/knowledge"
}
```

### Sub-Projetos

Para repositórios com múltiplos componentes independentes (plugins, pacotes de monorepo, módulos, etc.), o `.luminavault.json` raiz registra cada sub-projeto com seu próprio vault e chave de pasta relativa:

```json
{
  "project": "projeto1",
  "path": "HOME/.lumina-vault/knowledge",
  "subprojects": {
    "modulo/subprojeto1": {
      "project": "subprojeto1",
      "path": "HOME/.lumina-vault/knowledge"
    },
    "modulo/subprojeto2": {
      "project": "subprojeto2",
      "path": "HOME/.lumina-vault/knowledge"
    },
    "relatorios/subprojeto3": {
      "project": "subprojeto3",
      "path": "/caminho/customizado/para/subprojeto3"
    }
  }
}
```

**Importante:** os vaults dos sub-projetos são independentes — podem ser armazenados em qualquer caminho, não necessariamente dentro do vault do projeto pai.

### Como Funciona a Detecção de Sub-Projeto

A ferramenta recebe `workspace_root` (o diretório onde a IA está trabalhando) e:

1. Sobe a árvore de diretórios até encontrar `.luminavault.json`
2. Calcula o caminho relativo entre a localização do config e o `workspace_root`
3. Compara com as chaves de `subprojects` (casamento pelo prefixo mais longo)
4. Usa o vault do sub-projeto correspondente

| `workspace_root` | Resultado |
|---|---|
| `/caminho/projeto1` | Projeto raiz `projeto1` |
| `/caminho/projeto1/modulo/subprojeto1` | Sub-projeto `subprojeto1` |
| `/caminho/projeto1/modulo/subprojeto1/subdir` | Sub-projeto `subprojeto1` (casamento por prefixo) |
| `/caminho/projeto1/relatorios/subprojeto3` | Sub-projeto `subprojeto3` |

### Registrando um Novo Sub-Projeto

Quando `init_project_memory` é chamado com um `workspace_root` que está **dentro** de um projeto (existe um `.luminavault.json` ancestral) mas **ainda não está registrado** como sub-projeto:

1. Cria o vault para o novo sub-projeto
2. Registra automaticamente no `.luminavault.json` do pai
3. **Não** cria um `.luminavault.json` na pasta do sub-projeto

Para armazenar o vault do sub-projeto em um local customizado, passe o argumento `path` explicitamente.

### Configuração do Caminho do Vault

| Método | Como |
|---|---|
| Sobrescrita global | Defina a variável de ambiente `LUMINAVAULT_BASE_PATH` |
| Sobrescrita por ferramenta | Passe o parâmetro opcional `path` para qualquer ferramenta |
| Atalhos de caminho | Use `~`, `$HOME` ou `HOME` no início de qualquer caminho |

Localização padrão: `~/.lumina-vault/knowledge`

## 🌐 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `LUMINAVAULT_BASE_PATH` | `~/.lumina-vault/knowledge` | Sobrescreve o caminho padrão de armazenamento do vault. Suporta os atalhos `~`, `$HOME` e `HOME`. |

Veja o arquivo [`.env.example`](.env.example) para um template comentado.

## 📦 Instalação

### Opção 1 — Executar diretamente com npx (recomendada, sem instalação)

```bash
npx lumina-vault
```

### Opção 2 — Instalação global

```bash
npm install -g lumina-vault
```

Após a instalação, o binário `lumina-vault` estará disponível globalmente.

### Opção 3 — A partir do código-fonte

```bash
git clone https://github.com/kaduvelasco/lumina-vault.git
cd lumina-vault
npm install
npm run build
```

O servidor compilado estará em `dist/index.js`.

## 🔧 Configuração por Cliente

> **Dica:** use `lumina-vault install [target]` para configurar automaticamente. As seções abaixo mostram como fazer manualmente.

### Claude Code CLI

**Via linha de comando (recomendado):**

```bash
# Usando npx (sem instalação prévia)
claude mcp add lumina-vault npx -- -y lumina-vault

# Usando instalação global
claude mcp add lumina-vault lumina-vault

# Usando build do código-fonte
claude mcp add lumina-vault node -- /caminho/absoluto/para/lumina-vault/dist/index.js
```

**Via arquivo de configuração** — adicione em `.claude/settings.json` (nível de projeto) ou `~/.claude/settings.json` (nível de usuário):

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"]
    }
  }
}
```

> Para verificar se o servidor está ativo: `claude mcp list`

---

### Antigravity CLI

Edite `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"]
    }
  }
}
```

> Reinicie o Antigravity CLI após editar o arquivo para que as alterações entrem em vigor.

---

### Codex CLI

Edite `~/.codex/config.yaml`:

```yaml
mcp_servers:
  lumina-vault:
    command: npx
    args:
      - "-y"
      - lumina-vault
```

---

### OpenCode CLI

Edite `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "servers": {
      "lumina-vault": {
        "type": "local",
        "command": "npx",
        "args": ["-y", "lumina-vault"]
      }
    }
  }
}
```

---

### OpenCode Desktop

Abra **Settings → MCP Servers** e adicione um novo servidor:

| Campo | Valor |
|---|---|
| Name | `lumina-vault` |
| Type | `stdio` |
| Command | `npx` |
| Arguments | `-y lumina-vault` |

---

### Windsurf

Edite `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"]
    }
  }
}
```

Você também pode configurar pela interface: **Settings → MCP → Add Server**.

---

### Cursor

Edite `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"]
    }
  }
}
```

---

### Zed

Edite `~/.config/zed/settings.json` (Linux) ou `~/Library/Application Support/Zed/settings.json` (macOS):

```json
{
  "context_servers": {
    "lumina-vault": {
      "command": { "path": "npx", "args": ["-y", "lumina-vault"] },
      "settings": {}
    }
  }
}
```

---

### Cline (extensão VS Code)

Edite o arquivo de configuração MCP do Cline:

- **Linux:** `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows:** `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

---

### Definindo um Caminho de Vault Customizado

Todos os clientes suportam o repasse de variáveis de ambiente para o servidor:

```json
{
  "mcpServers": {
    "lumina-vault": {
      "command": "npx",
      "args": ["-y", "lumina-vault"],
      "env": {
        "LUMINAVAULT_BASE_PATH": "/home/usuario/meus-vaults"
      }
    }
  }
}
```

## 💡 Exemplos de Prompts

Os prompts abaixo funcionam diretamente com as ferramentas expostas pelo Lumina Vault.

---

### Salvando o Trabalho da Sessão (prompt vago)

> Atualize a memória do subprojeto1.

O AI chama `load_project_context` para ler o estado atual do vault, analisa a conversa e então chama `update_project_memory` com o conteúdo categorizado:

```
update_project_memory({
  project: "subprojeto1",
  progress: "## 2026-04-23\n- Implementada a funcionalidade X\n- Arquivos: src/servico.ts, src/cliente.ts",
  decisions: "## 2026-04-23\n- Escolhida abordagem A em vez de abordagem B pela melhor performance e manutenibilidade",
  next_steps: "## Agora\n- Escrever testes unitários para a funcionalidade X\n- Documentar o fluxo de integração"
})
```

Campos escritos por **adição** (logs — o histórico nunca é perdido):
- `progress` → `progress.md`
- `decisions` → `decisions.md`

Campos escritos por **sobrescrita** (sempre refletem o estado atual):
- `next_steps` → `next_steps.md`
- `memory` → `memory.md`
- `architecture` → `architecture.md`
- `stack` → `stack.md`

Campos com **modo configurável** (padrão: adição):
- `custom` → array de `{ filename, content, mode? }` — qualquer arquivo `.md` fora do conjunto padrão; `mode: "append"` (padrão) ou `mode: "write"`

---

### Inicializando um Projeto Raiz

> Inicialize o vault de memória para um novo projeto. Use `init_project_memory` com: project "projeto1", workspace_root "/caminho/projeto1", auto_detect true. Então resuma o que foi detectado.

---

### Inicializando um Sub-Projeto

> Estou começando a trabalhar no módulo subprojeto1. Use `init_project_memory` com workspace_root "/caminho/projeto1/modulo/subprojeto1" e project "subprojeto1". Registre como sub-projeto e use o caminho de vault padrão.

---

### Auto-Detecção do Sub-Projeto Ativo

> Estou trabalhando na pasta "/caminho/projeto1/modulo/subprojeto2". Use `load_project_context` com workspace_root "/caminho/projeto1/modulo/subprojeto2" — a ferramenta deve detectar automaticamente qual sub-projeto está ativo e carregar seu vault.

---

### Retomando o Trabalho Após uma Pausa

> Voltei ao trabalho. Use `load_project_context` com workspace_root "/caminho/projeto1/modulo/subprojeto1" para recarregar o contexto do módulo subprojeto1 e resuma: última tarefa concluída, próximos passos e decisões em aberto.

---

### Registrando uma Decisão em um Sub-Projeto

> Decidimos usar a abordagem A em vez da abordagem B para o subprojeto1. Use `append_memory` com workspace_root "/caminho/projeto1/modulo/subprojeto1" e filename "decisions.md". Registre: o que foi decidido, o motivo e o que foi rejeitado.

---

### Atualizando o Progresso de um Sub-Projeto

> Acabei de implementar o serviço principal do subprojeto1. Use `append_memory` com workspace_root "/caminho/projeto1/modulo/subprojeto1" e filename "progress.md". Inclua a data de hoje, o que foi feito e os arquivos alterados: `src/servico.ts` e `src/cliente.ts`.

---

### Busca em Todos os Sub-Projetos

> Busque no vault do projeto1 pela palavra-chave "autenticacao" com 3 linhas de contexto. Quero ver como cada módulo trata a autenticação.

---

### Busca Dentro de um Sub-Projeto Específico

> Busque por "database" somente no sub-projeto subprojeto3. Use `search_memory` com workspace_root "/caminho/projeto1/relatorios/subprojeto3" e query "database", com 2 linhas de contexto.

---

### Comparando Sub-Projetos

> Use `load_project_context` para os projetos "subprojeto1" e "subprojeto2". Compare os próximos passos dos dois e me diga qual tem trabalho pendente mais crítico.

---

### Verificação de Saúde de um Sub-Projeto

> Use `check_project_health` com workspace_root "/caminho/projeto1/relatorios/subprojeto3" para verificar se o vault do subprojeto3 está completo. Liste arquivos ausentes ou vazios e sugira o que cada um deveria conter.

---

### Documentando a Stack de um Sub-Projeto

> Use `write_memory` com workspace_root "/caminho/projeto1/modulo/subprojeto1" e filename "stack.md". Documente a stack: linguagem e versão, framework principal, principais bibliotecas, banco de dados e ferramentas de teste.

---

### Listando Todos os Sub-Projetos

> Use `list_projects` para mostrar todos os vaults disponíveis. Depois me diga quais correspondem aos sub-projetos do projeto1 com base nos nomes.

---

### Removendo um Sub-Projeto

Sub-projetos são detectados automaticamente ao escanear o vault por subpastas que contenham os arquivos de memória padrão. Não há registro para remover.

- Se você apagou a pasta de origem mas quer manter os dados do vault, nenhuma ação é necessária — o sub-projeto continuará aparecendo em `list_projects` enquanto seus arquivos existirem.
- Se você quiser apagar permanentemente os dados do vault, use `delete_project` com `project` e `subproject`:

> Apague o vault do módulo subprojeto1 do projeto1.

---

### Gravando Arquivos de Memória Customizados

> Use `update_project_memory` com project "subprojeto1" e o campo `custom` para sobrescrever a documentação da API e adicionar ao log de testes:

```
update_project_memory({
  project: "subprojeto1",
  custom: [
    { filename: "api.md", content: "# REST API\n## Endpoints\n...", mode: "write" },
    { filename: "testing.md", content: "## 2026-04-23\n- Adicionados testes unitários para a funcionalidade X" }
  ]
})
```

## 🖥️ Referência da CLI

O binário `lumina-vault` expõe comandos de instalação e configuração do vault.

### `install [target]`

Configura automaticamente o lumina-vault como servidor MCP nas suas ferramentas de IA. Targets suportados: `claude`, `codex`, `opencode`, `windsurf`, `antigravity`, `cursor`, `zed`, `cline`.

```bash
# Instalar em todas as ferramentas suportadas (pede confirmação)
lumina-vault install

# Instalar em uma ferramenta específica
lumina-vault install claude
lumina-vault install codex
lumina-vault install opencode
lumina-vault install windsurf
lumina-vault install antigravity
lumina-vault install cursor
lumina-vault install zed
lumina-vault install cline
```

Targets baseados em CLI (`claude`, `codex`, `opencode`, `windsurf`) são ignorados se a ferramenta não for encontrada no `PATH`. Targets baseados em arquivo (`antigravity`, `cursor`, `zed`, `cline`) são ignorados se a ferramenta não for detectada no sistema (verificação por presença de diretório).

---

### `config set-vault <path>`

Define o caminho padrão global do vault. Aceita os atalhos `~`, `$HOME` e `HOME`.

```bash
lumina-vault config set-vault ~/.lumina-vault/knowledge
lumina-vault config set-vault HOME/meus-vaults
lumina-vault config set-vault /caminho/absoluto/customizado
```

### `config get-vault`

Exibe o caminho global do vault atualmente configurado.

```bash
lumina-vault config get-vault
# Global vault path: /home/usuario/.lumina-vault/knowledge
```

### `config unset-vault`

Remove a configuração global do vault e reverte para o caminho padrão (`~/.lumina-vault/knowledge`).

```bash
lumina-vault config unset-vault
# Global vault path removed. Using default.
```

> **Nota:** o caminho global definido via CLI é lido pelo servidor MCP na inicialização. Após alterar, reinicie o servidor MCP no seu cliente.

## 🤝 Contribuindo

Contribuições são bem-vindas! Leia [CONTRIBUINDO.md](CONTRIBUINDO.md) para as diretrizes.

## 📄 Licença

Este projeto está licenciado sob a Licença MIT. Veja [LICENSE](LICENSE) para mais detalhes.

---

Feito com ❤️ e IA por [Kadu Velasco](https://github.com/kaduvelasco)
