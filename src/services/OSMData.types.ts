export type OSMElementType = "node" | "way" | "relation";

export type OSMElementTags = {
    [key: string]: string
}

export type OSMElement = OSMNode | OSMWay | OSMRelation;

export type OSMNode = {
    id: number
    type: "node"
    tags: OSMElementTags
    
    lon: number
    lat: number
}

export type OSMWay = {
    id: number
    type: "way"
    tags: OSMElementTags
    
    nodes: number[]
}

export type OSMRelationMember = {
    ref: number
    type: OSMElementType
    role?: string
}

export type OSMRelation = {
    id: number
    type: "relation"
    tags: OSMElementTags
    
    members: OSMRelationMember[]
}

export type LonLatTuple = [lon:number, lat: number];
export type LonLat = {lon:number, lat: number};

