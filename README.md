# Minhas Tarefas — Painel Diário

Aplicativo web interativo (HTML/CSS/JS puro, sem backend) para gerenciar tarefas diárias de forma visual e fluida.

## Funcionalidades

- **Abas/espaços**: To do's, 1:1 Yás, Entregáveis, Atividades Extra e Anotações — cada uma com seu próprio painel de tarefas.
- **CRUD completo de tarefas**: criar, editar, ver detalhes e excluir.
- **Painel Kanban** (A fazer / Em andamento / Concluída / Cancelada) com drag-and-drop, ou visualização em lista agrupada por tema (com renomear, criar e mover tarefas entre temas).
- **Classificação por prioridade**, incluindo **Urgente** (destaque visual em vermelho pulsante) além de Alta, Média e Baixa.
- **Detalhes ricos por tarefa**: descrição, prioridade, categoria, data e hora, checklist de subtarefas e notas/comentários de progresso.
- **Integração com Google Agenda**: botão "Adicionar ao Google Agenda" (abre evento pré-preenchido) e exportação de arquivo `.ics` para importar em qualquer calendário.
- **Evidências e anexos**: arraste arquivos, cole imagens da área de transferência ou selecione fotos/documentos. Imagens têm preview em miniatura e visualização ampliada (lightbox).
- **Busca, filtros e ordenação** por status, prioridade, categoria e texto livre.
- **Métricas de uso**: total de tarefas, taxa de conclusão, tempo médio de conclusão, sequência de dias ativos (streak), gráficos de atividade diária, distribuição por status/prioridade/categoria/aba e um log de atividades recentes — com filtro por aba.
- **Tema claro/escuro**, com detecção automática da preferência do sistema.
- **Exportar/Importar dados** em JSON (inclui anexos) para backup ou migração.
- **100% local**: os dados ficam no navegador (localStorage para tarefas/atividades, IndexedDB para os arquivos anexados). Nenhum dado é enviado a servidores.
- **Notas H2 (entregáveis)**: painel que calcula automaticamente a nota prévia (1 a 5, cumulativa) de cada entregável do semestre, com base em checklists de tarefas por nível de nota. Veja a seção [Notas dos Entregáveis](#notas-dos-entregáveis) abaixo.

## Como usar

Basta abrir `index.html` no navegador — não é necessário instalar nada.

## Publicar no GitHub Pages

1. Faça push deste repositório para o GitHub.
2. Vá em **Settings → Pages**.
3. Em "Source", selecione a branch principal e a pasta `/ (root)`.
4. Salve. Em alguns minutos o app estará disponível em `https://<seu-usuario>.github.io/<repositorio>/`.

## Estrutura

```
index.html               Estrutura da aplicação (painel, dashboard, notas, modais)
css/style.css             Estilos, temas e layout responsivo
js/db.js                  Camada IndexedDB para anexos (fotos/arquivos/evidências)
js/app.js                 Lógica da aplicação: CRUD, filtros, métricas e gráficos
js/entregaveis.js         Lógica do painel de Notas H2 (lê os .md de /entregaveis)
entregaveis/*.md          Checklists por entregável, fonte da verdade das notas
```

## Notas dos Entregáveis

A aba **"🎯 Notas H2"** calcula automaticamente a nota prévia (1 a 5) de cada entregável do
semestre, com base nas tarefas marcadas nos arquivos `entregaveis/*.md`.

- Cada entregável tem seções `## Nota 2` a `## Nota 5` com uma lista de tarefas em checkbox
  (`- [ ] tarefa — prazo: AAAA-MM-DD — descrição opcional`). A "Nota 1" é o estado padrão, sem
  tarefas — é o que já vale se nada for feito.
- **A nota só sobe quando todas as tarefas daquele nível estiverem concluídas** (níveis
  cumulativos: não dá pra pular do 2 pro 4 sem completar o 3).
- Marcar um checkbox na tela salva um rascunho no navegador (não altera o arquivo do
  repositório). Para registrar oficialmente o progresso:
  - baixe o arquivo atualizado pelo botão do card (mesmo nome do arquivo original) e suba no
    GitHub em **Add file → Upload files**, arrastando por cima do arquivo antigo; ou
  - peça para o Claude commitar a alteração diretamente no repositório.
- O botão **"🔄 Sincronizar"** descarta o rascunho local e volta a mostrar a última versão
  publicada no repositório.

## Observações

- Arquivos individuais anexados são limitados a 8MB para preservar performance do navegador.
- Como os dados residem no navegador, use "Exportar dados" periodicamente para backup, ou para levar suas tarefas para outro dispositivo/navegador (via "Importar dados").
- O painel de Notas H2 usa `fetch()` para ler os arquivos `.md`, então só funciona servido por
  http(s) (GitHub Pages ou um servidor local) — não abrindo o `index.html` direto como arquivo
  (`file://`).
