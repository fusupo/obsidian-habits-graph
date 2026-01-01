# Org Habits Graph

An Obsidian plugin that displays org-mode style habit consistency graphs for recurring tasks managed by the [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks).

![Org Habits Graph Example](https://orgmode.org/img/habits.png)

## Requirements

**This plugin requires the Tasks plugin to be installed and enabled.**

- Install from: [obsidian-tasks-plugin](https://github.com/obsidian-tasks-group/obsidian-tasks)

## Features

- 📊 **Visual consistency graphs** - See your habit completion history at a glance
- 🔥 **Streak tracking** - Display current streak counts for each habit
- 🎨 **Org-mode colors** - Green for completed, red for missed, yellow for today
- ⚙️ **Customizable** - Configure date ranges, habit tags, and display options
- 🔄 **Auto-refresh** - Graphs update automatically when you complete tasks

## Usage

### 1. Create Habit Tasks

In any markdown file, create recurring tasks with the `#habit` tag:

```markdown
- [ ] Morning workout 🔁 every day #habit 📅 2025-01-18
- [ ] Bible reading 🔁 every day #habit 📅 2025-01-18
- [ ] Guitar practice 🔁 every week #habit 📅 2025-01-20
- [ ] Church 🔁 every week on Sunday #habit 📅 2025-01-19
```

**Important**: Use the Tasks plugin format:
- `🔁` - Recurrence rule (required)
- `#habit` - Tag to identify habits (configurable)
- `📅` - Due date
- `✅` - Completion date (Tasks adds this automatically)

### 2. Open the Habits View

- Click the calendar icon in the left ribbon, OR
- Use command palette: "Open habit consistency graph"

### 3. Complete Tasks

When you complete a task, Tasks plugin will:
- Mark it done with `✅` and today's date
- Create a new instance for the next occurrence
- The graph will auto-refresh to show your progress

Example after completion:
```markdown
- [x] Morning workout 🔁 every day #habit ✅ 2025-01-17
- [ ] Morning workout 🔁 every day #habit 📅 2025-01-18
```

## Graph Explanation

Each habit shows a consistency graph with:

```
Morning workout                      Daily 🔥 12
████████████████░░░░████████!        85% (18/21)
```

- **█ (Green)** - Task completed on this day
- **░ (Red)** - Task missed on this day
- **! (Border)** - Today's indicator
- **Gray** - Future days (not yet due)
- **🔥 12** - Current streak (12 days in a row)
- **85% (18/21)** - Completion rate over the graph window

## Settings

Access settings via **Settings → Org Habits Graph**:

- **Habit tag**: Tag to identify habit tasks (default: `habit`)
- **Days before today**: Number of past days to show (default: 21)
- **Days after today**: Number of future days to show (default: 7)
- **Show streak count**: Display current streak next to habit name (default: on)

## Tips

### Recommended File Structure

Create a dedicated habits file:

```
habits.md
├── Daily Habits
│   ├── Morning workout
│   ├── Bible reading
│   └── Healthy cooking
└── Weekly Habits
    ├── Church attendance
    └── Family game night
```

### Track Different Frequencies

The plugin supports any recurrence rule from Tasks:
- `🔁 every day` - Daily habits
- `🔁 every 2 days` - Every other day
- `🔁 every week` - Weekly
- `🔁 every week on Sunday` - Specific day of week
- `🔁 every month` - Monthly

### Multiple Habit Tags

You can use different tags for different habit categories:
- `#health` for fitness habits
- `#spiritual` for spiritual practices
- `#learning` for study habits

Just update the "Habit tag" setting to switch between views.

## Development

### Build from source

```bash
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

### File structure

```
src/
  main.ts              # Plugin lifecycle
  settings.ts          # Settings interface
  tasksApi.ts          # Tasks plugin integration
  habitGraphView.ts    # Custom view
  graphRenderer.ts     # Graph rendering logic
```

## Acknowledgments

- Inspired by [org-mode habits](https://orgmode.org/manual/Tracking-your-habits.html)
- Built as a companion to [obsidian-tasks-plugin](https://github.com/obsidian-tasks-group/obsidian-tasks)
- Graph styling inspired by [heatmap-calendar-obsidian](https://github.com/Richardsl/heatmap-calendar-obsidian)

## License

MIT
