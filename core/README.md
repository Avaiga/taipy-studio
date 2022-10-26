# Taipy: Configuration Builder 

Taipy Configuration Builder makes it possible to create complete configuration files for
[Taipy](https://www.taipy.io).<br/>
These files must have the `.toml` extension.

With Taipy Configuration Builder you can create, edit or remove any configuration element
from a dedicated pane.

## Opening the Taipy Configuration Builder pane

The Taipy Configuration Builder pane appears in the Visual Studio Code secondary side bar.<br/>
All you need to do to make it visible is check the _View > Appearance > Secondary Side Bar_ option.

## Features

### Config Files section

This section lists all the potential configuration files in your project. Configuration files
(`.toml` files) appear in the 'Config Files' section with their base name.

If several files have the same base name, the actual directory path where this file is located
appears next to the configuration file name.

When you select a configuration file from the 'Config Files' section, all other sections get
updated with the relevant configuration items that were recognized in the selected configuration
file.

### Data Nodes section

The Data Nodes section displays the list of the names of all the data nodes read from the
selected configuration file.

- If you select a Data Node, its details appear in the Details view, at the bottom of the pane.
- If you right-click a Data Node, you can select the 'Add/Show node'
  option:
  - If the Data Node is already present in the Pipeline or Scenario
    diagram view that is opened, the view will be panned so
    that this Data Node is displayed in its center.
  - If the Data Node is not present in the Pipeline or Scenario
    diagram view that is opened, it is added to it, so you can connect
    it.

### Tasks section

The Tasks section displays the list of the names of all the tasks read from the
selected configuration file.

- If you select a Task, its details appear in the Details view, at the bottom of the pane.
- If you right-click a Task, you can select the 'Add/Show node'
  option:
  - If the Task is already present in the Pipeline or Scenario
    diagram view that is opened, the view will be panned so
    that this Task is displayed in its center.
  - If the Task is not present in the Pipeline or Scenario
    diagram view that is opened, it is added to it.

### Pipelines section

The Pipelines section displays the list of the names of all the pipelines read from the
selected configuration file.

- If you select a Pipeline, its details appear in the Details view, at the bottom of the pane.
- If you right-click a Pipeline, you have two options:

   - "Add/Show node": if the opened diagram view is a Scenario view,
     the Pipeline is added to the view it if was not yet present.<br/>
    If the Pipeline was already in the scenario represented by the
    diagram view, the view is panned so you can spot the
    pipeline node.
  
  - "Show perspective": opens a diagram view for that pipeline.


### Text edition of configuration files.

If you open a configuration file from the Explorer area, it opens just
like any regular text file in Visual Studio Code.

The Taipy Configuration Builder provides support for a faster and safer
edition of this text file:

- Every change to the configuration is automatically updated in the
  configuration elements sections in the Configuration Builder pane.
- If the file has semantic problems, they show up as wiggles under the
  elements, as well as in the Problems window.
- For configuration elements that refer to other elements (such as
  Tasks that refer to Data Nodes), you can rely on the auto-complete
  functionality:

  Say for example that you want to add a Data Node to the 'inputs' list
  of a given task.<br/>
  Move your cursor inside the square brackets of the 'inputs' property
  of your target task and press Ctrl-Space.<br/>
  The list of available Data Nodes that are not yet part of this list
  shows up so you can pick the one you want to add.

You can also drag configuration elements from their section to the text
location where you want to use that element, press the Shift key and
release the mouse button. The configuration element will be added, if
relevant, to your target text.
