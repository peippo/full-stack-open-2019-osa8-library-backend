const { ApolloServer, UserInputError, gql } = require("apollo-server");
const mongoose = require("mongoose");
const config = require("./utils/config");
const uuid = require("uuid/v1");
const Author = require("./models/author");
const Book = require("./models/book");

mongoose.set("useFindAndModify", false);

console.log("Connecting to", config.MONGODB_URI);

mongoose
	.connect(config.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true
	})
	.then(() => {
		console.log("Connected to MongoDB");
	})
	.catch(error => {
		console.log("Error connection to MongoDB:", error.message);
	});

const typeDefs = gql`
	type Author {
		name: String!
		id: ID!
		born: Int
		bookCount: Int
	}

	type Book {
		title: String!
		published: Int!
		author: Author
		id: ID!
		genres: [String]!
	}

	type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author]!
	}

	type Mutation {
		addBook(
			title: String!
			published: Int!
			author: String!
			genres: [String]!
		): Book
		editAuthor(name: String!, setBornTo: Int): Author
	}
`;

const resolvers = {
	Author: {
		bookCount: async (root, args) => {
			const books = await Book.find({ author: { $eq: root.id } });
			return books.length;
		}
	},
	Query: {
		bookCount: () => Book.collection.countDocuments(),
		authorCount: () => Author.collection.countDocuments(),
		allBooks: (root, args) => {
			return Book.find({}).populate("author");
		},
		allAuthors: () => Author.find({})
	},
	Mutation: {
		addBook: async (root, args) => {
			if (args.title.length <= 3) {
				throw new UserInputError(
					"Title must be at least 3 characters",
					{
						invalidArgs: args.title
					}
				);
			}

			if (args.author.length <= 4) {
				throw new UserInputError(
					"Author name must be at least 4 characters",
					{
						invalidArgs: args.author
					}
				);
			}

			const bookExists = await Book.findOne({ title: args.title });

			if (bookExists) {
				throw new UserInputError("Title must be unique", {
					invalidArgs: args.title
				});
			}

			let author = await Author.findOne({ name: args.author });

			if (author === null) {
				author = new Author({ name: args.author });

				try {
					await author.save();
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args
					});
				}
			}

			const book = new Book({ ...args, author });

			try {
				await book.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				});
			}

			return book;
		},
		editAuthor: async (roots, args) => {
			const author = await Author.findOne({ name: args.name });
			author.born = args.setBornTo;

			try {
				await author.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				});
			}

			return author;
		}
	}
};

const server = new ApolloServer({
	typeDefs,
	resolvers
});

server.listen().then(({ url }) => {
	console.log(`Server ready at ${url}`);
});
