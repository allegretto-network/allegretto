#!/usr/bin/env node
import { createProgram } from "./index.ts";
import { agent } from "./commands/agent.ts";
import { auth } from "./commands/auth.ts";
import { mpp } from "./commands/mpp.ts";
import { storage } from "./commands/storage.ts";
import { wallet } from "./commands/wallet.ts";
import { addJsonOption } from "./utils/result.ts";

const program = createProgram();

program.addCommand(agent).addCommand(auth).addCommand(mpp).addCommand(storage).addCommand(wallet);
addJsonOption(program);

program.parse();
