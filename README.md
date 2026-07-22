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
- **Notas H2 (entregáveis)**: cadastre e atualize tarefas livremente para cada um dos 3 entregáveis do semestre (nome, descrição, data, status), vinculando cada tarefa ao nível de nota que ela comprova. A nota prévia (1 a 5, cumulativa) é calculada automaticamente. Veja a seção [Notas dos Entregáveis](#notas-dos-entregáveis) abaixo.

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
js/entregaveis.js         Lógica do painel de Notas H2: tarefas por entregável e cálculo de nota
```

## Notas dos Entregáveis

A aba **"🎯 Notas H2"** mostra os 3 entregáveis do semestre (Hub de IA, Trilha de
Desenvolvimento, Sustentação dos Programas), cada um com sua régua de nota (1 a 5) fixa.

- Use **"+ Nova tarefa"** (ou o "+ Adicionar tarefa" dentro de cada nível) para cadastrar uma
  tarefa: nome, descrição opcional, data opcional, o entregável e o **nível/nota** que ela ajuda
  a comprovar.
- Marque como concluída pelo círculo ao lado da tarefa, ou editando-a.
- **A nota prévia sobe automaticamente só quando todas as tarefas daquele nível estiverem
  concluídas** (níveis cumulativos: não dá pra pular do 2 pro 4 sem completar o 3).
- Assim como o resto do app, os dados ficam salvos no navegador (localStorage).

## Observações

- Arquivos individuais anexados são limitados a 8MB para preservar performance do navegador.
- Como os dados residem no navegador, use "Exportar dados" periodicamente para backup, ou para levar suas tarefas para outro dispositivo/navegador (via "Importar dados").
