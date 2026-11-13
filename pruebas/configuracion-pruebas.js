// Se ejecuta antes de las pruebas: variables de entorno solo para los tests.
process.env.NODE_ENV = 'test';
process.env.LOGIN_MAX_ATTEMPTS = '1000'; // el límite de intentos se prueba aparte
