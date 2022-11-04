export const countChar = (str: string, char: string): number => {
    return str.split(char).length - 1;
};
interface ElementProperty {
    name: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    default_property?: any;
    type: string;
    doc: string;
}

interface ElementDetail {
    properties?: ElementProperty[];
    inherits?: string[];
}

// visual elements parser
export const getElementProperties = (visualElements: object): Record<string, Record<string, string>> => {
    const blocks: Record<string, ElementDetail> = (visualElements["blocks" as keyof typeof visualElements] as any).reduce(
        (obj: Record<string, ElementDetail>, v: any) => {
            obj[v[0]] = v[1];
            return obj;
        },
        {} as Record<string, ElementDetail>
    );
    const controls: Record<string, ElementDetail> = (visualElements["controls" as keyof typeof visualElements] as any).reduce(
        (obj: Record<string, ElementDetail>, v: any) => {
            obj[v[0]] = v[1];
            return obj;
        },
        {} as Record<string, ElementDetail>
    );
    const undocumented: Record<string, ElementDetail> = (
        visualElements["undocumented" as keyof typeof visualElements] as any
    ).reduce((obj: Record<string, ElementDetail>, v: any) => {
        obj[v[0]] = v[1];
        return obj;
    }, {} as Record<string, ElementDetail>);
    const blocksProperties: Record<string, Record<string, string>> = {};
    const controlsProperties: Record<string, Record<string, string>> = {};
    // handle all blocks object
    Object.keys(blocks).forEach((v: string) => {
        let elementDetail: ElementDetail = blocks[v];
        blocksProperties[v] = parseElementDetail(elementDetail, blocks, controls, undocumented);
    });
    Object.keys(controls).forEach((v: string) => {
        let elementDetail: ElementDetail = controls[v];
        controlsProperties[v] = parseElementDetail(elementDetail, blocks, controls, undocumented);
    });
    return { ...blocksProperties, ...controlsProperties };
};

export const getBlockElementList = (visualElements: object): string[] => {
    return (visualElements["blocks" as keyof typeof visualElements] as typeof Object[]).map((v: any) => v[0] as string);
};

export const getControlElementList = (visualElements: object): string[] => {
    return (visualElements["controls" as keyof typeof visualElements] as typeof Object[]).map((v: any) => v[0] as string);
};

export const getElementList = (visualElements: object): string[] => {
    return [...getControlElementList(visualElements), ...getBlockElementList(visualElements)];
};

const parseProperty = (property: ElementProperty): string => {
    return `[${property.type}]${property.default_property ? "(" + property.default_property.toString() + ")" : ""}: ${
        property.doc
    }`;
};

const parsePropertyList = (propertyList: ElementProperty[] | undefined): Record<string, string> => {
    if (!propertyList) {
        return {};
    }
    return propertyList.reduce((obj: Record<string, string>, v: ElementProperty) => {
        obj[v.name] = parseProperty(v);
        return obj;
    }, {} as Record<string, string>);
};

const handleInherits = (
    inherits: string[] | undefined,
    blocks: Record<string, ElementDetail>,
    controls: Record<string, ElementDetail>,
    undocumented: Record<string, ElementDetail>
): Record<string, string> => {
    let properties: Record<string, string> = {};
    if (!inherits) {
        return properties;
    }
    inherits.forEach((v) => {
        let elementDetail: ElementDetail;
        if (v in undocumented) {
            elementDetail = undocumented[v];
        } else if (v in controls) {
            elementDetail = controls[v];
        } else {
            elementDetail = blocks[v];
        }
        properties = { ...properties, ...parseElementDetail(elementDetail, blocks, controls, undocumented) };
    });
    return properties;
};

const parseElementDetail = (
    elementDetail: ElementDetail,
    blocks: Record<string, ElementDetail>,
    controls: Record<string, ElementDetail>,
    undocumented: Record<string, ElementDetail>
): Record<string, string> => {
    return {
        ...parsePropertyList(elementDetail.properties),
        ...handleInherits(elementDetail.inherits, blocks, controls, undocumented),
    };
};
