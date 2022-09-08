# Taipy Studio

Taipy Studio is ultimately an application that allows for creating Taipy applications
reducing the code that needs to be manually created.

This application builder comes with predefined features that greatly accelerate
the development of applications that rely on Taipy Core.

Taipy Studio depends on [Visual Studio Code](https://code.visualstudio.com/) which provides a
full development environment, including state-of-the-art support for the Python programming
language. The Taipy-specific functionality is provided as a Visual Studio Code extension,
which this repository holds the source code.<br/>
Taipy Studio was created using the [`yo`](https://www.npmjs.com/package/yo) utility that
builds a skeleton for Visual Studio extensions. The
[`Yo Code`](https://www.npmjs.com/package/generator-code) package will let you run `yo code`
that generates a boilerplate for the project.

## Features

This extension makes it possible to configure a Taipy application by providing
the appropriate settings to a configuration file that is exposed in a series
of areas grouped in the **Taipy Configuration** panel.

## Prerequisites

The only prerequisites for building and testing this Visual Studio Code extension
are Node.js and the `npm` command line interface.

Installers that will install both can be found [here](https://nodejs.org/en/download/).


## Installation for development

The extension is made of two separate parts: the VSCode integration part, and
the views that are facing end users (called web views).

- Install the required `npm` modules for VSCode integration:
  ```
  npm i
  ```

- Install the required `npm` modules for the web views:
  ```
  cd webviews
  npm i
  ```
  

## Debugging

- Build the extension:
  ```
  npm run build 
  ```

- Run a compilation process in the background to watch for code changes in the extension:
  ```
  npm run watch 
  ```

- In another terminal, run a compilation process in the background to watch for code
  changes in the web views:
  ```
  cd webviews
  npm run watch 
  ```

### Notes on debugging:

- Breakpoints.<br/>
  when setting breakpoints in the extension code, you will notice that they are
  systematically disabled. The fact is that the code is actually loaded (and therefore allowed
  to be debugged) when the extension is activated. Your breakpoints will be hit when the
  extension activates, in the VSCode Extension Development Host (the instance of Visual
  Studio Code that loads and runs your extension code).

- Reloading the extension.<br/>
  When the code of the extension is modified, the VSCode Extension Development Host does not
  automatically reflect the changes.

  We can of course stop the debugging session (killing the host or restarting the debug
  session). A faster way to reload the extension would be to trigger the 'Developer: Reload
  Window' command from the host VSCode.<br/>
  It is recommended to assign a keyboard shortcut to this command so you won't have to find
  it in the Command Palette every time you need it (the command identifier is
  `workbench.action.reloadWindow` and is bound to the `Crtl-R` key by default).

  Note that this does not apply to WebViews content: if code is changed that impacts 

- Traces.<br/>
  Calls to `console.log()` are redirected to the "Debug Console" panel in the primary VSCode instance.

## Build

## Packaging

## Notes on implementation

### Panels and views

- The **Taipy Configuration** window is a sidebar, implemented as a View Container.<br/>
  - Implementation class: `ConfigPanel` (providers/ConfigView.tsx).
  - Identifier: 'taipy-config-panel' (package.json and CONFIG_PANEL_ID in constants.ts).

- The **Config Files** view lets you select or create a new configuration file.<br/>
  - Implementation class: `ConfigFilesView` (providers/ConfigFilesView.tsx).
  - Identifier: 'taipy-config-files' (package.json and CONFIG_FILES_ID in constants.ts).
