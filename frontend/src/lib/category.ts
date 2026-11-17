import type { IssueCategory } from "../types";

/**
 * Rótulos em linguagem simples para as categorias internas de problema.
 * As chaves em inglês continuam sendo o vocabulário técnico usado pelo backend
 * e pela IA; aqui elas só ganham uma versão fácil de entender para o usuário.
 */
export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  Injection: "Injeção de comandos",
  "Auth & Access": "Login e acesso",
  "Secrets Leak": "Segredo exposto",
  "Config / Insecure Deps": "Configuração e bibliotecas",
  "Code Quality": "Qualidade do código",
};

export function categoryLabel(category: IssueCategory | string) {
  return CATEGORY_LABEL[category as IssueCategory] ?? category;
}
