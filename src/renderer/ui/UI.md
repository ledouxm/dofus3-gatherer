# UI Component Reference

All reusable UI components live in `src/renderer/ui/`. Chakra UI v3 is used throughout (dark mode forced).

---

## OverlayIconButton

**File:** `src/renderer/ui/OverlayIconButton.tsx`

Absolutely-positioned 36×36 glass-style icon button for map overlays. All four corner buttons share this styling.

```tsx
<OverlayIconButton
  aria-label="Settings"
  bottom="96px"
  left="8px"
  isActive={false}
  activeColor="blue.400"   // optional, default blue.400
  onClick={handler}
>
  <LuSettings />
</OverlayIconButton>
```

**Button stack (left side, bottom-up):**

| Component             | bottom  | left |
|-----------------------|---------|------|
| ResourcePickerButton  | 8px     | 8px  |
| WorldMapPickerButton  | 52px    | 8px  |
| ConfigButton          | 96px    | 8px  |

To add another button above ConfigButton use `bottom="140px"`.

---

## ConfigButton

**File:** `src/renderer/ui/ConfigButton.tsx`

Settings gear button that opens a `Dialog` modal for editing `config.mappings`.

- Uses `useMappings()` / `useUpdateConfigMutation()` from `ConfigProvider`
- Each mapping field has a `[?]` tooltip explaining the expected value
- "Open Packet Viewer" button calls `window.api.openViewerWindow()`
- Calls `useUpdateConfigMutation` on Save

No props — self-contained.

---

## Spinner

**File:** `src/renderer/ui/Spinner.tsx`

Generic loading spinner. Check the file for current props.

---

## TitleBar

**File:** `src/renderer/ui/TitleBar.tsx`

Custom frameless window titlebar with pin / minimize / close controls. Uses `-webkit-app-region: drag`.

---

## WorldMapPickerButton

**File:** `src/renderer/ui/WorldMapPickerButton.tsx`

Chakra `Menu` dropdown for selecting the active worldmap. Reads/writes `mapStore.selectedWorldmapId`.

---

## ResourcePickerButton

**File:** `src/renderer/ui/ResourcePickerButton.tsx`

Chakra `Menu` multi-select for toggling resource types on the map. Reads/writes `mapStore.selectedResourceIds`.

---

# Viewer Window Components

All viewer components live in `src/renderer/viewer/`. The viewer window is opened via `window.api.openViewerWindow()` and loads the same renderer at hash `#/viewer`.

## ViewerApp

**File:** `src/renderer/viewer/ViewerApp.tsx`

Root component for the `#/viewer` window. Handles:
- Source selection (dropdown populated via `window.api.getDesktopSources()`)
- Record / Stop controls (delegates to `usePacketRecorder`)
- Layout: 55/45 grid (VideoPlayer left, PacketTimeline right)
- Loads any existing recording from main process on mount via `window.api.getRecording()`

## usePacketRecorder

**File:** `src/renderer/viewer/usePacketRecorder.ts`

Hook that coordinates screen recording (`MediaRecorder`) and packet capture (`server-packet-broadcast` IPC channel).

```ts
const { status, duration, start, stop, reset } = usePacketRecorder();
// status: 'idle' | 'recording' | 'processing' | 'done'
await start(mediaStream);   // attach packet listener + start MediaRecorder
const recording = await stop(); // stops both, calls window.api.saveRecording
```

**Exported types:**
- `PacketEntry { typeName, data, relativeMs }`
- `Recording { startTime, packets, videoBuffer }`

**Exported helpers:**
- `formatDuration(seconds)` → `"MM:SS"`
- `formatMs(ms)` → `"MM:SS.s"`

## VideoPlayer

**File:** `src/renderer/viewer/VideoPlayer.tsx`

Feeds a `<video>` element from an `ArrayBuffer`. Calls `onTimeUpdate(currentMs)` on each frame so the timeline can highlight nearby packets.

```tsx
<VideoPlayer videoBuffer={recording.videoBuffer} onTimeUpdate={setCurrentMs} />
```

## PacketTimeline

**File:** `src/renderer/viewer/PacketTimeline.tsx`

Scrollable packet list with:
- Filter input (type name substring match)
- Color-coded type badges (deterministic per type name)
- Auto-scroll to keep the active window (±500ms of `currentMs`) visible
- Click row → expand JSON detail panel at the bottom

```tsx
<PacketTimeline
  packets={recording.packets}
  currentMs={currentMs}
  onSelect={setSelectedPacket}
  selectedPacket={selectedPacket}
/>
```

---

# IPC API (Packet Viewer additions)

Added to `window.api` in `src/preload/index.ts`:

| Method | Description |
|---|---|
| `openViewerWindow()` | Opens a new BrowserWindow at `#/viewer` |
| `getDesktopSources()` | Returns `DesktopCapturerSource[]` for screen/window selection |
| `saveRecording(data)` | Stores recording in main process memory |
| `getRecording()` | Retrieves stored recording |
| `onAnyServerPacket(cb)` | Listen to ALL decoded server packets (broadcast channel) |
| `offAnyServerPacket(cb)` | Remove listener |

Packets are now broadcast to **all open windows** via `BrowserWindow.getAllWindows()` in `src/main/index.ts`, on both `server-packet/{typeName}` and `server-packet-broadcast` channels.
