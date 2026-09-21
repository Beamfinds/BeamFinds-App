# BeamFinds App

BeamFinds App is a desktop mod downloader and manager for the game [BeamNG.drive](https://www.beamng.com/). It connects to [BeamFinds](https://beamfinds.com) to download mods directly into your BeamNG.drive mods folder and provides tools for keeping an installation organized.

## Features

- Download and queue BeamNG.drive mods
- Track active and completed downloads
- Manage installed, updated, disabled, and conflicting mods
- Analyze common mod conflicts and JBeam/material issues
- Automatically detect or manually select the BeamNG.drive mods folder
- Auto-Updater
- Discord Rich Presence integration
- Support for BeamFinds links through the `beamfinds://` protocol

## Requirements

- Node.js 18 or newer
- npm
- BeamNG.drive installed for mod management
- A BeamFinds account for downloading mods

## Development

1. Clone the repository:

   ```bash
   git clone https://github.com/Beamfinds/BeamFinds-App.git
   cd BeamFinds-App
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the Vite development server:

   ```bash
   npm run dev
   ```

4. In a separate terminal, start the Electron application:

   ```bash
   npm start
   ```

The Electron app loads the Vite development server when `NODE_ENV=development` is set.

## Building

Build the renderer and package the application for Windows:

```bash
npm run build
```

Build a Linux AppImage:

```bash
npm run build:linux
```

On Windows, `build-linux.bat` can be used to run the Linux build inside the Electron Builder Docker image:

```bat
build-linux.bat
```

The packaged application is generated in the `dist/` directory by Electron Builder.

## Project Structure

```text
main.js          Electron main process
preload.js       Secure renderer bridge
handlers/        Main-process handlers and application services
src/             React renderer source
src/pages/       Application pages
src/components/  Shared React components
src/store/       Zustand state stores
renderer/        Built renderer output
build/           Application icons and build resources
```

## Configuration

On first launch, BeamFinds attempts to detect the BeamNG.drive mods folder. If detection is unsuccessful, the folder can be selected manually during setup or later in the application settings.

## Contributing

Issues and suggestions are welcome. Please do not submit or publish modified
versions, forks, builds, websites, or derivative works without prior written
permission from BeamFinds.

## License

BeamFinds is source-available for personal viewing and evaluation only. It is
not released under an open-source license. See the [BeamFinds Source-Available License](LICENSE)
for the complete terms.
