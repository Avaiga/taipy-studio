import { config, MessageFormat } from "vscode-nls";

const localize = config({ messageFormat: MessageFormat.file })();

// NodeDetail
export const emptyNodeDetailContent = localize("ConfigDetailsView.emptyContent", "No selected element.");

// Tree Views
export const selectDatanodeTitle = localize("DataNodeItem.title", "Select data node");
export const selectTaskTitle = localize("TaskItem.title", "Select task");
export const selectPipelineTitle = localize("PipelineItem.title", "Select pipeline");
export const selectScenarioTitle = localize("ScenarioItem.title", "Select scenario");

// File View
export const configFileItemTitle = localize("ConfigFileItem.title", "Select file");

// Config Editor
export const getInvalidEntityTypeForPerspective = (perspType: string, nodeType: string) =>
  localize("ConfigEditor.invalidEntityTypeForPerspective", "Cannot show a {0} entity in a {1} Perpective.", nodeType, perspType);
export const defaultNodeNotShown = localize("ConfigEditor.noDefaultNode", '"default" entity cannot be used.');
export const getNewNameInputPrompt = (nodeType: string) => localize("ConfigEditor.newNameInputPromt", "Enter a name for a new {0} entity.", nodeType);
export const getNewNameInputTitle = (nodeType: string) => localize("ConfigEditor.newNameInputTitle", "new {0} name", nodeType);
export const getNewNameInputError = (nodeType: string, nodeName: string, emptyOrSpace = false) =>
  emptyOrSpace
    ? localize("ConfigEditor.newNameInputSpaceError", "Entity {0} Name should not contain space, '.' or be empty or be default '{1}'", nodeType, nodeName)
    : localize("ConfigEditor.newNameInputError", "Another {0} entity has the name {1}", nodeType, nodeName);
export const getTomlError = (file: string) => localize("ConfigEditor.tomlError", "Document '{0}' is not valid toml.", file.split("/").at(-1));
export const getConsistencyWarning = (nodeType: string, nodeName: string) => localize("ConfigEditor.consistencyWarning", "Element '{0}.{1}' does not exist.", nodeType, nodeName);
export const getUnreferencedELement = (nodeType: string, nodeName: string) => localize("ConfigEditor.unreferencedELement", "No reference to Element '{0}.{1}'.", nodeType, nodeName);

export const getSelectPropertyTitle = (nodeType: string) => localize("ConfigDetails.selectPropertyTitle", "Select property for {0}.", nodeType);
export const getNoTypeEntityFound = (nodeType: string) => localize("ConfigDetails.noTypeEntityFound", "No {0} entity in toml.", nodeType);
export const getSelectChildEntities = (childType: string, nodeType: string, propertyName: string) => localize("ConfigDetails.selectChildEntities", "Select {0} entities for {1}.{2}", childType, nodeType, propertyName);
export const getSelectValueForProperty = (nodeType: string, propertyName: string) => localize("ConfigDetails.selectValueForProperty", "Select value for {0}.{1}", nodeType, propertyName);
export const getEnterValueForProperty = (nodeType: string, propertyName: string) => localize("ConfigDetails.enterValueForProperty", "Enter value for {0}.{1}", nodeType, propertyName);