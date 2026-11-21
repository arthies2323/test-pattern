import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';
import { UserMother } from './builders/UserMother.js';

describe('CheckoutService', () => {
    const cartao = { numero: '4111111111111111', validade: '12/30', cvv: '123' };

    describe('quando o pagamento falha', () => {
        let gatewayStub;
        let repositoryDummy;
        let emailDummy;
        let pedido;

        beforeEach(async () => {
            const carrinho = new CarrinhoBuilder().build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            repositoryDummy = { salvar: jest.fn() };
            emailDummy = { enviarEmail: jest.fn() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);

            pedido = await checkoutService.processarPedido(carrinho, cartao);
        });

        it('deve retornar null', () => {
            expect(pedido).toBeNull();
        });

        it('não deve salvar o pedido nem enviar e-mail', () => {
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente Padrão finaliza a compra', () => {
        it('deve retornar o pedido salvo com o total sem desconto', async () => {
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Teclado', 150), new Item('Mouse', 50)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async (p) => new Pedido(10, p.carrinho, p.totalFinal, p.status)),
            };
            const emailStub = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            expect(pedido).toBeInstanceOf(Pedido);
            expect(pedido.id).toBe(10);
            expect(pedido.totalFinal).toBe(200);
            expect(pedido.status).toBe('PROCESSADO');
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let gatewayStub;
        let repositoryStub;
        let emailMock;
        let pedido;

        beforeEach(async () => {
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = new CarrinhoBuilder()
                .comUser(usuarioPremium)
                .comItens([new Item('Fone de Ouvido', 120), new Item('Carregador', 80)])
                .build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            repositoryStub = {
                salvar: jest.fn().mockResolvedValue(new Pedido(42, carrinho, 180, 'PROCESSADO')),
            };
            emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            pedido = await checkoutService.processarPedido(carrinho, cartao);
        });

        it('deve cobrar o valor com 10% de desconto', () => {
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartao);
        });

        it('deve enviar o e-mail de confirmação uma única vez com os dados corretos', () => {
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 42 no valor de R$180'
            );
        });

        it('deve retornar o pedido salvo', () => {
            expect(pedido.id).toBe(42);
            expect(pedido.totalFinal).toBe(180);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve falhar o checkout', async () => {
            const carrinho = new CarrinhoBuilder().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(7, carrinho, 100, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP indisponível')) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);
            jest.spyOn(console, 'error').mockImplementation(() => {});

            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            expect(pedido).toBe(pedidoSalvo);
            console.error.mockRestore();
        });
    });
});
