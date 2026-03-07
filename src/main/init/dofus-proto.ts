import path from "path";
import { promises as fs, existsSync, mkdirSync } from "fs";
import protobuf from "protobufjs";
import { app } from "electron";

const anyProto = `
syntax="proto3";
package google.protobuf;
message Any{
  string type_url=1;
    bytes value=2;
}
`;

const baseProto = `
syntax = "proto3";

import "google/protobuf/any.proto";

message TemplateMessage {
  TemplateEvent event = 1;
  TemplatePayload payload = 2;
}

message TemplateEvent {
  bool flag = 1;
  int32 code = 2;
  int32 extra = 3;
  google.protobuf.Any data = 4;
}

message TemplatePayload {
  google.protobuf.Any data = 1;
}
`;

export const getDofusSqlitePath = () => path.join(app.getPath("userData"), "dofus.sqlite");

export const initDofusProto = async () => {
    const dofusProto = await downloadProto();

    const proto = new protobuf.Root();
    protobuf.parse(anyProto, proto);
    protobuf.parse(baseProto, proto);
    protobuf.parse(dofusProto, proto);

    return proto;
};

export const downloadProto = async () => {
    const dofusProtoPath = path.join(app.getPath("userData"), "dofus.proto");
    const url = "https://github.com/ledouxm/dofus-sqlite/releases/latest/download/dofus.proto";
    if (existsSync(dofusProtoPath)) {
        console.log("Proto file already exists, skipping download. Reading from", dofusProtoPath);
        return await fs.readFile(dofusProtoPath, "utf-8");
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download proto file: ${response.statusText}`);
    }

    const protoText = await response.text();
    await fs.writeFile(dofusProtoPath, protoText, "utf-8");

    return protoText;
};
