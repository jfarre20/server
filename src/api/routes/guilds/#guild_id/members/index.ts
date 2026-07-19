/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors
	
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Request, Response, Router } from "express";
import { HTTPError } from "lambert-server/HTTPError";
import { MoreThan } from "typeorm";
import { route } from "@spacebar/api/util/handlers/route";
import { Member } from "@spacebar/database";

const router = Router({ mergeParams: true });

// TODO: send over websocket
// TODO: check for GUILD_MEMBERS intent

router.get(
    "/",
    route({
        query: {
            limit: {
                type: "number",
                description: "max number of members to return (1-1000). default 1",
            },
            after: {
                type: "string",
            },
        },
        responses: {
            200: {
                body: "PublicMemberArray",
            },
            403: {
                body: "APIErrorResponse",
            },
        },
    }),
    async (req: Request, res: Response) => {
        const { guild_id } = req.params as { [key: string]: string };
        const limit = Number(req.query.limit) || 1;
        if (limit > 1000 || limit < 1) throw new HTTPError("Limit must be between 1 and 1000");
        // `${undefined}` is the truthy string "undefined", which postgres
        // rejects as a bigint — only apply the cursor when actually provided
        const after = req.query.after ? `${req.query.after}` : undefined;
        const query = after ? { id: MoreThan(after) } : {};

        await Member.IsInGuildOrFail(req.user_id, guild_id);

        // toPublicMember() below projects the response, and it only includes
        // `user`/`roles` when the relations are loaded — without them the
        // response violates the declared PublicMember shape and clients can't
        // render anyone. No `select` here: combining select with relations +
        // take excludes the hidden primary key TypeORM needs for DISTINCT
        // pagination ("column distinctAlias.Member_index does not exist").
        const members = await Member.find({
            where: { guild_id, ...query },
            relations: { user: true, roles: true },
            take: limit,
            order: { id: "ASC" },
        });

        return res.json(members.map((m) => m.toPublicMember()));
    },
);

export default router;
