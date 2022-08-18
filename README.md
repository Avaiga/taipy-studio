# Taipy Studio

Taipy Studio is ultimately an application that allows for creating Taipy applications.

This application builder comes with predefined features that greatly accelerate
the development of applications that rely on Taipy Core.

Taipy Studio depends on [Visual Studio Code](https://code.visualstudio.com/) which provides a
full development environment, including state-of-the-art support for
the Python programming language. The Taipy-specific functionality is provided as
a Visual Studio Code extension, which this repository holds the source code.<br/>
Taipy Studio was created using the [`yo`](https://www.npmjs.com/package/yo) utility that builds a skeleton
for Visual Studio extensions. The [`Yo Code`](https://www.npmjs.com/package/generator-code) package will
let you run `yo code` that generates a boilerplate for the project.

## Features

## Installation

- Install `npm` modules:
  ```
  npm i
  ```

## Debugging

- Run a compilation process in the background to watch for code changes:
  ```
  tsc -watch -p ./
  ```

### Notes on debugging:

- Reloading the extension.<br/>
  When the code of the extension is modified, the VSCode Extension Development Host (the instance of Visual Studio
  Code that loads and runs your extension code) will not automatically update it.

  We can of course stop the debugging session (killing the host or restarting the debug session). A faster way
  to reload the extension would be to trigger the 'Developer: Reload Window' command from the host VSCode.<br/>
  It is recommended to assign a keyboard shortcut to this command so you won't have to find it in the Command
  Palette every time you need it (the command identifier is `workbench.action.reloadWindow`).

  Note that this does not apply to WebViews content: if code is changed that impacts 

- Traces.<br/>
  Calls to `console.log()` are redirected to the "Debug Console" panel in the primary VSCode instance.

## Build

## Packaging

