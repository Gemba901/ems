const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const AuthService = {
    async verifyIdentifier(identifier: string) {
        // @Post('verify-first-time')
        const res = await fetch(`${API_URL}/auth/verify-first-time`, { 
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ phoneOrEmail: identifier }),
        });

        
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Account not found!");
        }
        return res.json();
    },

    async setupAccount(setupToken: string, newPassword: string) { 
        // @Post('create-password')
        const res = await fetch(`${API_URL}/auth/create-password`, { 
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ setupToken, newPassword }), // Fixed payload keys
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Setup failed!");
        }
        return res.json();
    },

    async login(identifier: string, password: string) {
        // @Post('login')
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ phoneOrEmail: identifier, password }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Login failed!");
        }
        return res.json();
    },
};