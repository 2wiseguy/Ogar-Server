var Packet = require('./packet');

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    // Detect protocol version - we can do something about it later
    this.protocol = 0;

    this.pressQ = false;
    this.pressW = false;
    this.pressSpace = false;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function(message) {
    function stobuf(buf) {
        var length = buf.length;
        var arrayBuf = new ArrayBuffer(length);
        var view = new Uint8Array(arrayBuf);

        for (var i = 0; i < length; i++) {
            view[i] = buf[i];
        }

        return view.buffer;
    }

    // Discard empty messages
    if (message.length == 0) {
        return;
    }

    var buffer = stobuf(message);
    var view = new DataView(buffer);
    var packetId = view.getUint8(0, true);

    switch (packetId) {
        case 0:
            // Check for invalid packets
            if ((view.byteLength + 1) % 2 == 1) {
                break;
            }

            // Set Nickname
            var nick = "";
            var maxLen = this.gameServer.config.playerMaxNickLength * 2; // 2 bytes per char
            for (var i = 1; i < view.byteLength && i <= maxLen; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }

                nick += String.fromCharCode(charCode);
            }
            this.setNickname(nick);
            break;
        case 1:
            // Spectate mode
            if (this.socket.playerTracker.cells.length <= 0) {
                // Make sure client has no cells
                this.socket.playerTracker.spectate = true;
            }
            break;
        case 16:
            // Set Target
            if (view.byteLength == 13) {
                var client = this.socket.playerTracker;
                client.mouse.x = view.getInt32(1, true) - client.scrambleX;
                client.mouse.y = view.getInt32(5, true) - client.scrambleY;
            }
            break;
        case 17:
            // Space Press - Split cell
            this.pressSpace = true;
            break;
        case 18:
            // Q Key Pressed
            this.pressQ = true;
            break;
        case 19:
            // Q Key Released
            break;
        case 21:
            // W Press - Eject mass
            this.pressW = true;
            break;
        case 255:
            // Connection Start
            if (view.byteLength == 5) {
                this.protocol = view.getUint32(1, true);
                // Send SetBorder packet first
                var c = this.gameServer.config;
                this.socket.sendPacket(new Packet.SetBorder(
                    c.borderLeft + this.socket.playerTracker.scrambleX,
                    c.borderRight + this.socket.playerTracker.scrambleX,
                    c.borderTop + this.socket.playerTracker.scrambleY,
                    c.borderBottom + this.socket.playerTracker.scrambleY
                ));
            }
            break;
        default:
            break;
    }
};

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    if (client.cells.length < 1) {
        // Set name first
        client.setName(newNick);

        // If client has no cells... then spawn a player
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, client);

        // Turn off spectate mode
        client.spectate = false;
    }
};

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    if (client.cells.length < 1) {
        // Set name first
        var newSkin = "";
        if (newNick != null && newNick.length != 0) {
            if (newNick[0] == "<") {
                var n = newNick.indexOf(">",1);
                if (n != -1) {
                    newSkin = "%" + newNick.slice(1,n);
                    newNick = newNick.slice(n+1);
                }
            } else if (newNick[0] == "|") {
                var n = newNick.indexOf("|",1);
                if (n != -1) {
                    newSkin = ":http://" + newNick.slice(1,n);
                    newNick = newNick.slice(n+1);
                }
            }
        }
        if (this.gameServer.gameMode.haveTeams) {
            client.setName(" "+newNick+" "); //trick to disable skins in teammode
        } else {
            client.setName(newNick);
        }
        if (newSkin) {
            this.socket.saveSkin = newSkin;
        } else if (this.socket.saveSkin) {
            newSkin = this.socket.saveSkin;
        }
        client.setSkin(newSkin);

        // If client has no cells... then spawn a player
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer,client);

        // Turn off spectate mode
        client.spectate = false;
    }
};

UpdateNodes.prototype.build = function() {
    // Calculate nodes sub packet size before making the data view
    var nodesLength = 0;
    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        if (typeof node == "undefined") {
            continue;
        }

        nodesLength = nodesLength + 21 + (node.getName().length * 2) + node.getSkin().length;
    }

    var buf = new ArrayBuffer(3 + (this.destroyQueue.length * 12) + (this.nonVisibleNodes.length * 4) + nodesLength + 8);
    var view = new DataView(buf);

    view.setUint8(0, 16, true); // Packet ID
    view.setUint16(1, this.destroyQueue.length, true); // Nodes to be destroyed

    var offset = 3;
    for (var i = 0; i < this.destroyQueue.length; i++) {
        var node = this.destroyQueue[i];

        if (!node) {
            continue;
        }

        var killer = 0;
        if (node.getKiller()) {
            killer = node.getKiller().nodeId;
        }

        view.setUint32(offset, killer, true); // Killer ID
        view.setUint32(offset + 4, node.nodeId, true); // Node ID

        offset += 8;
    }

    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        if (typeof node == "undefined") {
            continue;
        }

        view.setUint32(offset, node.nodeId, true); // Node ID
        view.setInt32(offset + 4, node.position.x + this.scrambleX, true); // X position
        view.setInt32(offset + 8, node.position.y + this.scrambleY, true); // Y position
        view.setUint16(offset + 12, node.getSize(), true); // Mass formula: Radius (size) = (mass * mass) / 100
        view.setUint8(offset + 14, node.color.r, true); // Color (R)
        view.setUint8(offset + 15, node.color.g, true); // Color (G)
        view.setUint8(offset + 16, node.color.b, true); // Color (B)
        view.setUint8(offset + 17, (node.spiked | 4), true); // Flags
        offset += 18;

        var skin = node.getSkin();
        if (skin) {
            for (var j = 0; j < skin.length; j++) {
                var c = skin.charCodeAt(j);
                if (c){
                    view.setUint8(offset, c, true);
                }
                offset++;
            }
        }
        view.setUint8(offset, 0, true); // End of string
        offset++;

        var name = node.getName();
        if (name) {
            for (var j = 0; j < name.length; j++) {
                var c = name.charCodeAt(j);
                if (c){
                    view.setUint16(offset, c, true);
                }
                offset += 2;
            }
        }

        view.setUint16(offset, 0, true); // End of string
        offset += 2;
    }

    var len = this.nonVisibleNodes.length + this.destroyQueue.length;
    view.setUint32(offset, 0, true); // End
    view.setUint32(offset + 4, len, true); // # of non-visible nodes to destroy

    offset += 8;

    // Destroy queue + nonvisible nodes
    for (var i = 0; i < this.destroyQueue.length; i++) {
        var node = this.destroyQueue[i];

        if (!node) {
            continue;
        }

        view.setUint32(offset, node.nodeId, true);
        offset += 4;
    }
    for (var i = 0; i < this.nonVisibleNodes.length; i++) {
        var node = this.nonVisibleNodes[i];

        if (!node) {
            continue;
        }

        view.setUint32(offset, node.nodeId, true);
        offset += 4;
    }

    return buf;
};

Cell.prototype.getSkin = function() {
    if (this.owner) {
        return this.owner.skin;
    } else {
        return "";
    }
};

PlayerTracker.prototype.setSkin = function(skin) {
    this.skin = skin;
};

PlayerTracker.prototype.getSkin = function() {
    return this.skin;
};
