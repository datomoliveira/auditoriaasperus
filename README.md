# 🛡️ Auditoria de Segurança Web (Cloudflare & Agnostic AI Router)

Aplicação web moderna para auditoria de segurança de código fonte com design minimalista inspirado no ecossistema Apple e [uizze.sh](https://uizze.sh/), orquestrando a `security-audit-skill` em ambiente serverless/edge gratuito.

---

## ⚡ Destaques da Arquitetura

- **Frontend Apple-like:** Desenvolvido em React + TailwindCSS com estética minimalista (cantos arredondados, frosted glassmorphism, tipografia limpa, upload drag-and-drop de `.zip` e inspeção por URL Git).
- **Backend Edge / Serverless:** Construído com [Hono](https://hono.dev/) rodando sobre Cloudflare Workers (ou Node.js runtime).
- **Roteamento de IA com Failover Resiliente:** Suporte agnóstico a múltiplos provedores gratuitos (**Groq, Ollama local, DeepSeek, OpenRouter, Cloudflare Workers AI**). Se um provedor atingir limite de cota (429 Rate Limit) ou timeout, o roteador chaveia automaticamente para o próximo sem interromper a auditoria.
- **Zero Hardcoded Keys:** Nenhuma credencial chumbada no código fonte; 100% resolvido dinamicamente via variáveis de ambiente.
- **Sandbox Segura:** Prevenção contra ataques de Path Traversal (*Zip-Slip*) e isolamento temporário dos arquivos de auditoria.

---

## 📁 Estrutura do Projeto

```text
├── .env.example                # Template de configuração dos provedores de IA
├── package.json                # Gerenciamento unificado do monorepo
├── backend/
│   ├── package.json            # Dependências da API Hono
│   ├── wrangler.toml           # Configuração de deploy do Cloudflare Workers
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Entrypoint da API e health check do roteador
│       └── services/
│           ├── ai-client.ts    # AgnosticAIRouter com failover automático
│           └── audit-sandbox.ts # Orquestrador da sandbox e execução da skill
└── frontend/
    ├── package.json            # React + TailwindCSS + Lucide Icons
    ├── vite.config.ts          # Configuração do Vite
    ├── tailwind.config.js      # Tokens do Apple Design System
    ├── index.html
    └── src/
        ├── App.tsx             # Interface Apple-like com visualizador de failover
        ├── index.css           # Utilitários de glassmorphism
        └── main.tsx
```

---

## 🚀 Como Executar

### 1. Configurar Variáveis de Ambiente
Copie o arquivo de exemplo e preencha os provedores de sua preferência:
```bash
cp .env.example .env
```

Exemplo com Groq e Ollama local:
```env
AI_ROUTING_CHAIN="groq,ollama"
GROQ_API_KEY="gsk_sua_chave_groq"
OLLAMA_ENDPOINT="http://localhost:11434/v1"
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Rodar em Desenvolvimento
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

---

## ☁️ Deploy Gratuito no Cloudflare

### Backend (Cloudflare Workers):
```bash
cd backend
npx wrangler deploy
```

### Frontend (Cloudflare Pages):
Conecte o repositório no Cloudflare Pages com as configurações:
- **Build command:** `cd frontend && npm run build`
- **Build output directory:** `frontend/dist`
