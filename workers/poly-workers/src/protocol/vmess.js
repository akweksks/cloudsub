class VmessConverter {
    static normalizeCipher(value) {
        const cipher = String(value || '').trim().toLowerCase();
        return ['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none', 'zero'].includes(cipher)
            ? cipher
            : 'auto';
    }

    static transportNetwork(config) {
        if (config.net === 'tcp' && config.type === 'http') return 'http';
        return config.net || 'tcp';
    }

    static parse(link) {
        const vmessLink = link.replace('vmess://', '');
        let config;
        try {
            config = JSON.parse(atob(vmessLink));
        } catch (e) {
            throw new Error('Invalid VMess link');
        }

        const network = VmessConverter.transportNetwork(config);
        return {
            name: config.ps || 'VMess Node',
            server: config.add,
            port: parseInt(config.port),
            type: 'vmess',
            uuid: config.id,
            alterId: parseInt(config.aid),
            cipher: VmessConverter.normalizeCipher(config.scy || config.security || config.cipher),
            udp: true,
            tls: config.tls === 'tls'? true : false,
            'skip-cert-verify': config.verify_cert === false,
            network,
            'ws-opts': config.net === 'ws' ? {
                path: config.path || '/',
                headers: {
                    Host: config.host || config.add
                }
            } : undefined,
            'http-opts': network === 'http' ? {
                method: 'GET',
                path: [config.path || '/'],
                headers: {
                    Host: [config.host || config.add]
                }
            } : undefined,
            'grpc-opts': config.net === 'grpc' ? {
                'grpc-service-name': config.path || ''
            } : undefined
        };
    }
}
export default VmessConverter;
